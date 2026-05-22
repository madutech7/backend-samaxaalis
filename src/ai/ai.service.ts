import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TransactionsService } from '../transactions/transactions.service';
import { BudgetsService } from '../budgets/budgets.service';
import { ChatMessageDto } from './dto/chat.dto';

export interface AIInsight {
  title: string;
  description: string;
  type: 'positive' | 'negative' | 'warning';
}

export interface AIAnalysisResponse {
  financialScore: number;
  summary: string;
  savingsRateComment: string;
  insights: AIInsight[];
  recommendations: string[];
}

function getCurrencySymbol(code: string): string {
  const symbols: Record<string, string> = {
    XOF: 'CFA',
    XAF: 'FCFA',
    EUR: '€',
    USD: '$',
    CAD: 'CA$',
    GBP: '£',
    CHF: 'CHF',
    MAD: 'MAD',
    DZD: 'DZD',
    TND: 'TND',
    EGP: 'EGP',
    NGN: '₦',
    GHS: 'GHS',
    KES: 'KSh',
    ZAR: 'R',
    JPY: '¥',
    CNY: '¥',
    INR: '₹',
    AUD: 'A$',
    SGD: 'S$',
    AED: 'AED',
    SAR: 'SAR',
  };
  return symbols[code.toUpperCase()] ?? code;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly transactionsService: TransactionsService,
    private readonly budgetsService: BudgetsService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.logger.log('🤖 Initialisation de Google Gemini API réussie.');
      } catch (err) {
        this.logger.error('❌ Échec de l\'initialisation de Gemini API:', err);
      }
    } else {
      this.logger.warn(
        '⚠️ GEMINI_API_KEY non configurée. SamaCoach fonctionnera en mode simulation.',
      );
    }
  }

  /**
   * Génère le texte de contexte financier pour l'IA
   */
  private async buildFinancialContext(userId: string, currencyCode: string = 'EUR'): Promise<string> {
    const txResponse = await this.transactionsService.findAll(userId, { limit: 1000 });
    const transactions = txResponse.data;
    const budgets = await this.budgetsService.findAll(userId);
    const symbol = getCurrencySymbol(currencyCode);

    // Calculer les métriques globales
    let totalIncome = 0;
    let totalExpenses = 0;
    const categoryExpenses: Record<string, number> = {};

    transactions.forEach((t) => {
      const amount = Number(t.amount);
      if (t.type === 'income') {
        totalIncome += amount;
      } else {
        totalExpenses += amount;
        categoryExpenses[t.category] = (categoryExpenses[t.category] ?? 0) + amount;
      }
    });

    const netSavings = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

    // Contexte des budgets
    const budgetLines: string[] = [];
    for (const b of budgets) {
      const spent = categoryExpenses[b.category] ?? 0;
      const progress = b.limitAmount > 0 ? (spent / b.limitAmount) * 100 : 0;
      budgetLines.push(
        `- Catégorie ${b.category} : budget de ${b.limitAmount} ${symbol}, dépensé ${spent.toFixed(2)} ${symbol} (${progress.toFixed(1)}% consommé)`,
      );
    }

    // Top transactions récentes
    const recentTxs = [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10)
      .map((t) => `- ${new Date(t.date).toLocaleDateString('fr-FR')} | ${t.title} : ${t.type === 'income' ? '+' : '-'}${t.amount} ${symbol} (${t.category})`);

    const context = `
=== CONTEXTE FINANCIER DE L'UTILISATEUR ===
- Solde Actuel : ${netSavings.toFixed(2)} ${symbol}
- Total Revenus : ${totalIncome.toFixed(2)} ${symbol}
- Total Dépenses : ${totalExpenses.toFixed(2)} ${symbol}
- Épargne Nette : ${netSavings.toFixed(2)} ${symbol} (Taux d'épargne : ${savingsRate.toFixed(1)}%)
- Budgets Définis :
${budgetLines.length > 0 ? budgetLines.join('\n') : 'Aucun budget configuré.'}

- 10 Transactions Récentes :
${recentTxs.length > 0 ? recentTxs.join('\n') : 'Aucune transaction récente.'}
==========================================
    `;

    return context;
  }

  /**
   * Génère l'analyse de santé financière (Dashboard Coach)
   */
  async generateAnalysis(userId: string, currencyCode: string = 'EUR'): Promise<AIAnalysisResponse> {
    const context = await this.buildFinancialContext(userId, currencyCode);
    const symbol = getCurrencySymbol(currencyCode);

    if (!this.genAI) {
      return this.generateMockAnalysis(context, symbol);
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-pro',
        generationConfig: { responseMimeType: 'application/json' },
      });

      const prompt = `
Tu es SamaCoach, un conseiller financier IA bienveillant, motivant et expert.
Analyse le contexte financier de l'utilisateur ci-dessous et produis un rapport structuré en français.

Style et formatage :
1. Sois extrêmement professionnel, formel et direct. Tu as l'INTERDICTION ABSOLUE d'utiliser le moindre émoji. Ton texte doit être brut et sérieux.
2. Pour les listes ou la mise en valeur, utilise des tirets (-) clairs et des sauts de ligne pour structurer ton texte. Évite d'utiliser des étoiles (*) ou des doubles étoiles (**) pour le gras ou l'italique car cela peut poser des problèmes d'affichage sur l'application mobile. Reste sur du texte brut propre aéré.
3. Toutes les valeurs financières, les montants, les résumés et les insights que tu rédiges doivent impérativement utiliser la devise de l'utilisateur, à savoir : ${currencyCode} (symbole : ${symbol}).
4. Mentionne explicitement le Solde Actuel de l'utilisateur dans ton résumé pour qu'il sache où il en est de manière claire et bienveillante.

Données utilisateur :
${context}

Génère une réponse JSON strict selon ce schéma :
{
  "financialScore": number (de 0 à 100, représentant la santé financière générale),
  "summary": "string" (un court résumé global personnalisé et encourageant contenant le Solde Actuel de l'utilisateur, 2-3 phrases, adressé à l'utilisateur directement, sans aucun balisage Markdown ni astérisques),
  "savingsRateComment": "string" (une analyse du taux d'épargne de l'utilisateur avec conseils, sans aucun balisage Markdown ni astérisques),
  "insights": [
    { "title": "string", "description": "string", "type": "positive" | "negative" | "warning" }
  ] (maximum 3 insights clés basés sur les budgets ou transactions, sans aucun balisage Markdown ni astérisques),
  "recommendations": ["string"] (exactement 3 conseils spécifiques et actionnables pour optimiser ses finances, sans aucun balisage Markdown ni astérisques)
}
`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      return JSON.parse(responseText) as AIAnalysisResponse;
    } catch (err) {
      this.logger.error('❌ Erreur lors de l\'appel à Gemini pour l\'analyse:', err);
      return this.generateMockAnalysis(context, symbol);
    }
  }

  /**
   * Assure la conformité de l'historique pour le chat Gemini :
   * 1. Ignore les messages d'accueil statiques (role 'model' au début).
   * 2. Force l'alternance stricte des rôles (user -> model -> user -> model...).
   * 3. Fusionne les messages consécutifs du même rôle si nécessaire.
   */
  private sanitizeHistory(history?: ChatMessageDto[]): { role: 'user' | 'model'; parts: { text: string }[] }[] {
    if (!history || history.length === 0) {
      return [];
    }

    const geminiHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
    
    // Normalisation des rôles
    const rawHistory = history.map((msg) => ({
      role: msg.role === 'user' ? 'user' as const : 'model' as const,
      parts: [{ text: msg.content }],
    }));

    // Recherche du premier message 'user' car la session de chat Gemini doit obligatoirement démarrer par un message utilisateur
    const firstUserIdx = rawHistory.findIndex((msg) => msg.role === 'user');
    if (firstUserIdx === -1) {
      return [];
    }

    let currentMsg: { role: 'user' | 'model'; parts: { text: string }[] } | null = null;

    for (let i = firstUserIdx; i < rawHistory.length; i++) {
      const item = rawHistory[i];
      if (!currentMsg) {
        currentMsg = { role: item.role, parts: [{ text: item.parts[0].text }] };
      } else if (currentMsg.role === item.role) {
        // En cas de messages consécutifs du même rôle, on fusionne leur contenu pour éviter une erreur d'alternance
        currentMsg.parts[0].text += '\n' + item.parts[0].text;
      } else {
        geminiHistory.push(currentMsg);
        currentMsg = { role: item.role, parts: [{ text: item.parts[0].text }] };
      }
    }

    if (currentMsg) {
      geminiHistory.push(currentMsg);
    }

    return geminiHistory;
  }

  /**
   * Gère le chat interactif avec le coach
   */
  async chatWithCoach(
    userId: string,
    message: string,
    history?: ChatMessageDto[],
    currencyCode: string = 'EUR',
  ): Promise<string> {
    const context = await this.buildFinancialContext(userId, currencyCode);
    const symbol = getCurrencySymbol(currencyCode);

    if (!this.genAI) {
      return this.generateMockChatResponse(message, context, symbol);
    }

    try {
      // 10 Transactions Récentes et métriques globales
      const soldeActuel = context.includes('Solde Actuel : ') 
        ? context.split('Solde Actuel : ')[1].split('\n')[0].trim() 
        : `non défini`;

      // Invite système de SamaCoach (avec configuration stricte anti-gras markdown et contexte actualisé)
      const systemInstruction = `
Tu es SamaCoach, un coach en finances personnelles intelligent, amical, chaleureux et très ouvert. 
Tu aides l'utilisateur à comprendre ses dépenses, optimiser ses budgets et épargner pour ses projets.
Voici les données financières réelles de l'utilisateur pour éclairer tes réponses :
${context}

Considère ces données comme confidentielles et affiche de l'empathie.
Réponds de manière directe, concise, chaleureuse, naturelle et toujours en français.

Style de communication et consignes :
1. Sois extrêmement professionnel, formel et clair. Tu as l'INTERDICTION STRICTE d'utiliser le moindre émoji (pas de smiley, pas de symbole visuel). Ton texte doit être 100% composé de lettres, chiffres et ponctuation standard.
2. Présente tes réponses de façon aérée. Utilise des sauts de lignes pour séparer tes paragraphes et des tirets (-) pour les listes.
3. INTERDICTION ABSOLUE D'UTILISER DES ASTÉRISQUES : N'utilise JAMAIS de caractères étoiles (*) ou doubles étoiles (**) pour mettre du texte en gras ou en italique. Rédige uniquement en texte brut non formaté, très propre et lisible.
4. Toutes les valeurs financières et montants mentionnés dans tes réponses doivent impérativement utiliser la devise de l'utilisateur, à savoir : ${currencyCode} (symbole : ${symbol}).
5. Lorsque l'utilisateur demande son solde, ses dépenses ou sa situation financière, réponds-lui directement et simplement en utilisant les données ci-dessus. Par exemple, son Solde Actuel exact est de : ${soldeActuel}.
6. Sois flexible et conversationnel : réponds à toutes les questions de l'utilisateur avec simplicité et gentillesse, y compris les salutations ("bonjour", "salut"), les bavardages ou les questions de culture financière générale. Ne refuse pas de répondre et ne dis pas que tu es limité à un rôle strict. Si l'information demandée n'est pas disponible dans ses données, dis-le-lui simplement et propose ton aide.
7. Traduis TOUJOURS les catégories de dépenses en français dans tes réponses. Ne conserve PAS le terme anglais (par exemple, écris uniquement "alimentation" et jamais "food", etc).
8. CONNAISSANCE DE L'APPLICATION GESTFINA :
Tu es le guide expert de l'application. Voici les fonctionnalités que tu DOIS connaître et expliquer si on te pose la question :
- Écran Tableau de Bord : C'est l'écran principal avec les graphiques, le solde total, et le résumé par catégorie.
- Écran Transactions : Liste complète de l'historique. On peut filtrer par mois ou par type.
- Ajouter une dépense/revenu : Clique sur le gros bouton '+' au centre de la barre de navigation.
- Budgets : L'utilisateur peut définir des limites mensuelles par catégorie pour ne pas dépasser ses objectifs.
- Gestfina Pro (Premium) : Débloque les transactions illimitées, les exports PDF/CSV, les transactions récurrentes (loyer, salaire) et l'accès complet à ton analyse IA poussée.
- Sécurité : L'application supporte Face ID / Touch ID (activable dans les réglages) et les données sont chiffrées.
- Devises : On peut changer la devise (Euro, Dollar, FCFA, etc.) dans les paramètres du profil.

Ne dis JAMAIS "Je ne sais pas comment faire ça dans l'application". Si l'utilisateur demande "Comment je fais X", explique-lui le chemin dans l'interface de manière claire.
9. TON DE RÉPONSE : Tu ne dois être ni robotique, ni trop familier. Tu es un expert en finance de haut niveau mais accessible.
10. INTERDICTION DE FORMATAGE : Toujours pas d'émojis, pas de gras (**), rien que du texte brut aéré.
11. IDENTITÉ : Si on demande qui t'a créé, tu es l'IA de Gestfina développée pour accompagner les utilisateurs vers la liberté financière.
      `;

      // Utilisation native de systemInstruction pour que Gemini applique les consignes à chaque tour de chat
      const model = this.genAI.getGenerativeModel({ 
        model: 'gemini-1.5-pro',
        systemInstruction: systemInstruction,
      });

      // Assainissement de l'historique transmis par l'application mobile
      const cleanedHistory = this.sanitizeHistory(history);

      const chatSession = model.startChat({
        history: cleanedHistory,
      });

      const result = await chatSession.sendMessage(message);
      let replyText = result.response.text();

      // Nettoyage de sécurité final pour enlever les astérisques markdown résiduels
      replyText = replyText.replace(/\*\*?/g, '');

      return replyText;
    } catch (err) {
      this.logger.error('❌ Erreur lors du chat avec Gemini:', err);
      return this.generateMockChatResponse(message, context, symbol);
    }
  }

  // MARK: - Mocks & Fallbacks

  private generateMockAnalysis(context: string, symbol: string = '€'): AIAnalysisResponse {
    this.logger.log('⚠️ Génération d\'une analyse simulée (mode fallback)...');
    
    // Extraction rapide de quelques données pour personnaliser le mock
    const soldeStr = context.split('Solde Actuel : ')[1]?.split('\n')[0]?.trim() ?? `0.00 ${symbol}`;
    const totalIncomeStr = context.split('Total Revenus : ')[1]?.split('\n')[0]?.trim() ?? `0.00 ${symbol}`;
    const totalExpensesStr = context.split('Total Dépenses : ')[1]?.split('\n')[0]?.trim() ?? `0.00 ${symbol}`;
    
    const solde = parseFloat(soldeStr.replace(/[^\d.-]/g, '')) || 0;
    const hasHighExpenses = context.includes('Total Dépenses : ') && 
      parseFloat(totalExpensesStr.replace(/[^\d.-]/g, '')) > parseFloat(totalIncomeStr.replace(/[^\d.-]/g, '')) * 0.8;
    
    const rateStr = context.split('Taux d\'épargne : ')[1]?.split('%')[0] ?? '25';
    const rate = parseFloat(rateStr);

    let score = 75;
    let summary = `Madu, votre solde actuel s'élève à ${soldeStr}. Votre gestion budgétaire est saine ce mois-ci et vous parvenez à maintenir un équilibre positif entre vos revenus et vos charges récurrentes.`;
    let rateComment = `Votre taux d'épargne se situe à ${rate.toFixed(1)}%. C'est un bon début qui respecte la règle d'or d'épargner au moins 10 à 20% de vos gains.`;
    
    const insights: AIInsight[] = [
      {
        title: "Suivi rigoureux",
        description: `Vos transactions sont régulièrement saisies, ce qui fiabilise grandement vos prévisions budgétaires pour un solde de ${soldeStr}.`,
        type: "positive"
      }
    ];

    if (hasHighExpenses) {
      score = 58;
      summary = `Attention Madu, votre solde disponible est de ${soldeStr}. Vos dépenses récentes sont élevées par rapport à vos rentrées d'argent, limitez les sorties non indispensables.`;
      rateComment = `Avec un taux d'épargne de ${rate.toFixed(1)}%, votre marge de sécurité financière est mince. Essayez de constituer un fonds d'urgence plus solide.`;
      insights.push({
        title: "Alerte de surconsommation",
        description: "Le ratio dépenses/revenus dépasse les 80%. Vos budgets Shopping ou Loisirs mériteraient d'être temporairement réduits.",
        type: "warning"
      });
    } else {
      insights.push({
        title: "Capacité d'investissement",
        description: "Votre solde disponible vous permettrait d'envisager un virement permanent vers un compte d'épargne ou d'investissement.",
        type: "positive"
      });
    }

    // Ajout d'une alerte sur un budget si présent dans le contexte
    if (context.includes('consommé') && context.includes('%')) {
      insights.push({
        title: "Vigilance Budgets",
        description: "Une ou plusieurs catégories de dépenses se rapprochent dangereusement de leur plafond.",
        type: "warning"
      });
    } else {
      insights.push({
        title: "Pas de dépassement",
        description: "Aucun dépassement critique de budget n'a été détecté pour le moment.",
        type: "positive"
      });
    }

    return {
      financialScore: score,
      summary,
      savingsRateComment: rateComment,
      insights,
      recommendations: [
        "Planifiez un virement automatique d'épargne de 10% dès le jour de versement de votre salaire.",
        "Passez en revue vos abonnements mensuels récurrents pour supprimer ceux inutilisés.",
        `Essayez de différer de 48h tout achat impulsif supérieur à 50 ${symbol} afin de valider son utilité réelle.`
      ]
    };
  }

  private generateMockChatResponse(message: string, context: string, symbol: string = '€'): string {
    const msg = message.toLowerCase();
    
    // Normalisation des accents pour simplifier la recherche
    const normalizedMsg = msg.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const soldeStr = context.split('Solde Actuel : ')[1]?.split('\n')[0]?.trim() ?? `0.00 ${symbol}`;
    const totalIncomeStr = context.split('Total Revenus : ')[1]?.split('\n')[0]?.trim() ?? `0.00 ${symbol}`;
    const totalExpensesStr = context.split('Total Dépenses : ')[1]?.split('\n')[0]?.trim() ?? `0.00 ${symbol}`;
    const epargneNetteStr = context.split('Épargne Nette : ')[1]?.split('(')[0]?.trim() ?? `0.00 ${symbol}`;

    const containsAny = (words: string[]) => words.some(w => normalizedMsg.includes(w));

    if (containsAny(['bonjour', 'salut', 'coucou', 'hey', 'hello'])) {
      return `Bonjour Madu ! Je suis SamaCoach, votre assistant financier intelligent. Votre solde actuel s'élève à ${soldeStr}.\n\nJe suis prêt à répondre à vos questions sur vos dépenses, votre dernière transaction, vos revenus ou vos budgets. Que souhaitez-vous savoir ?`;
    }

    if (containsAny(['solde', 'argent', 'compte', 'combien', 'reste', 'avoir'])) {
      return `Bien sûr ! Votre solde actuel s'élève à ${soldeStr}.\n\nVoici un aperçu rapide de votre situation financière :\n- Total des Revenus : ${totalIncomeStr}\n- Total des Dépenses : ${totalExpensesStr}\n- Épargne Nette : ${epargneNetteStr}\n\nSi vous le souhaitez, nous pouvons voir comment optimiser tout cela ce mois-ci.`;
    }
    
    if (containsAny(['dernier', 'recente', 'historique', 'precedent'])) {
      const txsMatch = context.split('- 10 Transactions Récentes :\n')[1]?.split('================================')[0];
      if (txsMatch) {
         const lines = txsMatch.trim().split('\n');
         const lastTx = lines.find(l => l.startsWith('- '));
         if (lastTx) {
             return `Votre toute dernière transaction enregistrée est :\n${lastTx.replace('- ', '')}\n\nPour info, votre solde actuel est de ${soldeStr}.`;
         }
      }
      return `Je n'ai pas trouvé de transactions récentes dans votre historique.\n\nCependant, votre solde actuel est de ${soldeStr}.`;
    }
    
    if (containsAny(['depense', 'charge', 'sorti'])) {
      return `Vous avez dépensé un total de ${totalExpensesStr} récemment. Vos dépenses sont surveillées en permanence pour vous aider à rester dans le vert. Avez-vous une dépense spécifique en tête dont vous souhaitez discuter ?`;
    }

    if (containsAny(['revenu', 'salaire', 'gagne', 'rentree'])) {
      return `Vos revenus totaux enregistrés sont de ${totalIncomeStr}. Excellente nouvelle ! Avez-vous pensé à investir ou épargner une partie de cette somme (mettre 10 à 20% de côté est l'idéal) ?`;
    }

    if (containsAny(['budget', 'limite', 'plafond', 'depasse'])) {
      const budgetsMatch = context.split('- Budgets Définis :\n')[1]?.split('- 10 Transactions Récentes')[0];
      if (budgetsMatch && !budgetsMatch.includes('Aucun budget configuré')) {
        return `Voici un point d'attention sur vos budgets :\n${budgetsMatch.trim()}\n\nFaites attention aux catégories qui s'approchent des 100% de consommation pour éviter les mauvaises surprises à la fin du mois.`;
      }
      return `Vous n'avez pas encore défini de budgets de dépenses précis. Je vous recommande d'en créer depuis l'écran Budgets de GestFina pour mieux contrôler vos dépenses ! (surtout pour l'Alimentation et les Loisirs)`;
    }

    if (containsAny(['ps5', 'acheter', 'achat', 'offrir', 'telephone', 'macbook', 'ordinateur', 'tele', 'projet'])) {
      return `Tout achat plaisir ou matériel important dépend de votre capacité d'épargne. \n\nVu que votre solde disponible est de ${soldeStr} :\n- Vérifiez d'abord si cela ne met pas en péril vos charges fixes de ce mois-ci.\n- Avez-vous une épargne de sécurité de côté ? Si oui et que l'achat est budgété, faites-vous plaisir !\n- Sinon, je vous suggère d'étaler cette envie et d'épargner petit à petit pendant les 2-3 prochains mois pour l'acheter sans aucun stress financier.`;
    }
    
    if (containsAny(['loyer', 'logement', 'maison', 'appartement'])) {
      return `Le logement (loyer + charges) ne devrait idéalement pas dépasser 33% de vos revenus totaux (${totalIncomeStr}). \nDans votre cas, gardez un œil sur ce ratio ! C'est la charge fixe la plus lourde, assurez-vous qu'elle soit bien provisionnée chaque mois pour être serein.`;
    }

    if (containsAny(['voyage', 'vacances', 'avion', 'hotel', 'billet', 'sejour'])) {
      return `Préparer un voyage est un excellent projet !\nJe recommande de créer un budget "Vacances" dédié sur l'application. Essayez d'allouer au moins 5% à 10% de vos ${totalIncomeStr} de revenus mensuels jusqu'à votre date de départ pour éviter de creuser lourdement dans votre solde de ${soldeStr} d'un seul coup.`;
    }

    if (containsAny(['credit', 'dette', 'pret', 'emprunt'])) {
      return `Concernant les crédits, la règle d'or est de rembourser en priorité les dettes avec les taux d'intérêt les plus élevés (comme les crédits à la consommation). Avec une épargne nette de ${epargneNetteStr}, vous pourriez allouer un certain montant pour accélérer ces remboursements.`;
    }

    if (containsAny(['crypto', 'bitcoin', 'bourse', 'action', 'investir', 'investissement'])) {
      return `L'investissement (bourse, ETFs, crypto, etc.) est super pour le long terme. Mais n'investissez que l'argent dont vous n'avez pas besoin à court terme ! \nVérifiez si vous avez l'équivalent de 3 mois de dépenses de côté dans votre épargne de sécurité avant d'engager votre solde de ${soldeStr} sur des marchés risqués.`;
    }

    if (containsAny(['urgence', 'imprevu', 'galere', 'secour'])) {
      return `Un fonds d'urgence est vital pour votre tranquillité. L'objectif est d'avoir entre 3 et 6 mois de dépenses courantes sur un livret très sécurisé et facilement accessible. \nSi vos dépenses totales actuelles sont de ${totalExpensesStr}, calculez environ 3 fois ce montant pour constituer votre coussin de sécurité !`;
    }

    if (containsAny(['fete', 'noel', 'anniversaire', 'cadeau', 'tabaski', 'korite'])) {
      return `Anticiper les événements spéciaux (anniversaires, fêtes de fin d'année) permet d'éviter les gros découverts. L'astuce est de lisser le coût sur l'année : épargnez un tout petit peu chaque mois. \nVotre solde est de ${soldeStr}, alors planifiez vos gros cadeaux avec un budget fixe pour ne pas le vider.`;
    }
    
    if (containsAny(['nourriture', 'aliment', 'manger', 'courses', 'restaurant', 'resto'])) {
      return `L'alimentation est le poste de dépenses le plus facile à optimiser. Voici 3 conseils pour économiser :\n- Le Batch Cooking : Préparez vos plats de la semaine le dimanche.\n- Les listes strictes : N'allez pas faire les courses le ventre vide pour éviter les achats compulsifs.\n- Privilégiez les repas faits maison par rapport aux restaurants. Vous sauverez vite plusieurs dizaines d'euros !`;
    }

    if (containsAny(['economi', 'epargn', 'reduire', 'astuce', 'conseil', 'optimis'])) {
      return `Pour augmenter votre épargne, appliquez la règle des 50/30/20 :\n- 50% pour vos besoins essentiels (loyer, factures, courses).\n- 30% pour vos envies et loisirs.\n- 20% directement versés en épargne en début de mois.\n\nUne astuce immédiate : revoyez vos petits abonnements mensuels et supprimez ceux inutilisés depuis un mois. Sur un an, vous récupérez facilement plusieurs dizaines d'euros.`;
    }

    if (containsAny(['abonnement', 'netflix', 'spotify', 'canal', 'amazon', 'apple', 'streaming', 'forfait'])) {
      return `Les abonnements peuvent vite devenir un gouffre financier invisible ! Listez tous vos abonnements actifs et posez-vous la question : l'avez-vous utilisé au moins une fois ce mois-ci ?\n\nUn abonnement à 10 euros non utilisé, c'est 120 euros gaspillés par an. Votre épargne nette actuelle est de ${epargneNetteStr}, chaque euro compte.`;
    }

    if (containsAny(['sante', 'medecin', 'pharmacie', 'hopital', 'mutuelle', 'docteur'])) {
      return `Les dépenses santé sont difficiles à anticiper, mais importantes à budgétiser !\nJe vous conseille de prévoir une petite enveloppe mensuelle dédiée (médecin, pharmacie, optique) pour lisser ces coûts. Si vous avez une mutuelle, vérifiez vos remboursements pour éviter de payer des dépenses déjà couvertes.\n\nVotre solde actuel de ${soldeStr} vous donne une certaine marge, profitez-en pour constituer cette réserve santé.`;
    }

    if (containsAny(['telephone', 'mobile', 'forfait', 'operateur', 'free', 'orange', 'sfr', 'sim'])) {
      return `Un forfait téléphonique optimisé peut vous faire économiser 10 à 30 euros par mois !\nComparez régulièrement les offres. Les opérateurs pas chers (type Free, NRJ Mobile) proposent souvent les mêmes services à moitié prix. Sur votre solde disponible de ${soldeStr}, cette économie annuelle de 120-360 euros est loin d'être négligeable.`;
    }

    if (containsAny(['augmentation', 'negociation', 'salaire', 'raise', 'promotion'])) {
      return `Négocier une augmentation est l'un des meilleurs investissements de temps que vous puissiez faire !\n\nVos revenus actuels sont de ${totalIncomeStr}. Une augmentation de seulement 5 à 10% change radicalement votre capacité d'épargne sur le long terme. Préparez des arguments concrets (réalisations, valeur marché), choisissez le bon moment, et négociez avec confiance.`;
    }

    if (containsAny(['retraite', 'pension', 'futur', 'long terme', 'vieux'])) {
      return `Penser à la retraite tôt est une excellente décision !\n\nMême 50 euros par mois placés dès maintenant dans un plan épargne retraite peuvent représenter des dizaines de milliers d'euros dans 30 ans grâce aux intérêts composés. Avec votre épargne nette de ${epargneNetteStr} par mois, vous pouvez dès maintenant y allouer une petite part.`;
    }

    if (containsAny(['freelance', 'auto-entrepreneur', 'business', 'Side hustle', 'activite', 'creer'])) {
      return `Lancer une activité parallèle (freelance, vente en ligne, consulting) est un excellent moyen d'augmenter ses revenus !\n\nVos dépenses actuelles sont de ${totalExpensesStr}. Si vous arrivez à générer même 20% de ce montant en revenus complémentaires, cela change votre bilan financier. Notez que en auto-entreprise, il faut bien séparer vos finances personnelles et professionnelles.`;
    }

    if (containsAny(['impot', 'taxe', 'fisc', 'declaration', 'tva'])) {
      return `Les impôts sont souvent mal anticipés !\n\nSurtout si vous êtes indépendant ou freelance, mettez de côté environ 20 à 30% de chaque revenu perçu pour couvrir vos obligations fiscales. Si vous êtes salarié, vérifiez si vous êtes éligible à des réductions (dons, frais réels, investissement immobilier locatif).\n\nVotre solde de ${soldeStr} doit toujours intégrer cette réserve fiscale.`;
    }

    if (containsAny(['renovation', 'travaux', 'bricolage', 'peinture', 'cuisine', 'salle de bain'])) {
      return `Les travaux de rénovation ont tendance à dépasser le budget initial de 20 à 30% ! Prévoyez toujours une marge de sécurité.\n\nAvant de commencer, obtenez 3 devis comparatifs et établissez un budget fixe avec votre solde actuel de ${soldeStr}. Si cela le dépasse, envisagez un crédit travaux à taux zéro (PTZ en France) ou de faire les travaux en plusieurs phases.`;
    }

    if (containsAny(['objectif', 'but', 'projet', 'reve', 'ambition', 'goal'])) {
      return `Avoir un objectif financier clair est la clé pour ne pas dépenser sans compter !\n\nQuel est votre projet en ce moment ? Un voyage, un achat immobilier, une voiture ?\nAvec une épargne nette de ${epargneNetteStr} et un solde de ${soldeStr}, calculons ensemble combien de mois il faut pour l'atteindre. Donnez-moi le montant et je vous aide à planifier.`;
    }

    if (containsAny(['comparer', 'analyse', 'bilan', 'rapport', 'performance', 'resultat'])) {
      return `Voici un bilan express de votre situation :\n\n- Revenus : ${totalIncomeStr}\n- Dépenses : ${totalExpensesStr}\n- Épargne nette : ${epargneNetteStr}\n- Solde disponible : ${soldeStr}\n\nEn général, si votre taux d'épargne est supérieur à 15%, vous êtes sur la bonne voie. En dessous de 5%, il faudrait sérieusement revoir les postes de dépenses. Souhaitez-vous travailler sur un poste en particulier ?`;
    }

    if (containsAny(['shopping', 'mode', 'vetement', 'chaussure', 'sac', 'luxe', 'bijou'])) {
      return `Le shopping est l'un des pièges les plus courants pour l'équilibre budgétaire !\n\nL'astuce anti-impulsivité : attendez toujours 48h avant tout achat mode supérieur à 30 euros. Si vous y pensez encore après 2 jours, c'est probablement un vrai besoin.\n\nVotre solde actuel est de ${soldeStr}. Créez un budget mensuel "Shopping" fixe pour vous faire plaisir sans culpabiliser !`;
    }

    if (containsAny(['sport', 'salle', 'fitness', 'musculation', 'tennis', 'piscine', 'coach sportif'])) {
      return `Investir dans sa santé physique est l'un des meilleurs investissements sur le long terme !\n\nCela dit, si votre salle de sport coûte plus de 30 à 40 euros par mois et que vous y allez moins de 8 fois par mois, regardez des alternatives (sport en plein air, applications mobiles gratuites, salle low-cost). Votre épargne nette de ${epargneNetteStr} mérite chaque optimisation.`;
    }

    if (containsAny(['week-end', 'weekend', 'sortie', 'loisir', 'cinema', 'concert', 'bar'])) {
      return `Les loisirs et sorties sont essentiels pour votre bien-être, il ne faut pas les supprimer !\n\nLa clé est de les budgétiser. Allouez-vous un budget mensuel "Plaisir" fixe. Une fois l'enveloppe utilisée, pas de sorties supplémentaires jusqu'au mois suivant. Ainsi, vous profitez sereinement sans impacter votre solde de ${soldeStr}.`;
    }

    if (containsAny(['fatigue', 'stress', 'anxieux', 'angoisse', 'difficile', 'dur', 'galere', 'probleme'])) {
      return `Je comprends que les finances peuvent être une source de stress réelle. Vous n'êtes pas seul dans cette situation.\n\nPrenez les choses une à une. La première étape est toujours de savoir exactement où on en est, et votre solde actuel de ${soldeStr} est ce point de départ.\n\nEnsuite, on identifie ensemble un seul poste à améliorer ce mois-ci. Même un petit progrès de 20 à 30 euros d'économie est une victoire. Par quelle dépense voulez-vous commencer ?`;
    }

    if (containsAny(['regret', 'erreur', 'depense trop', 'gaspille', 'bêtise', 'fou', 'idiot'])) {
      return `Tout le monde fait des dépenses qu'il regrette, c'est humain !\n\nL'essentiel est d'en tirer une leçon et de réajuster pour le mois suivant. Avec votre solde de ${soldeStr}, regardez ce qui peut être réduit d'ici la fin du mois pour compenser cet écart. En finances personnelles, un mois difficile ne détruit pas tout si on se reprend rapidement.`;
    }

    if (containsAny(['bien dormir', 'revenu passif', 'argent dormir', 'passif', 'livret', 'placement'])) {
      return `Faire "travailler son argent" pendant qu'on dort, c'est le Saint Graal de la finance personnelle !\n\nAvec votre solde de ${soldeStr}, voici quelques pistes simples pour commencer :\n- Livret d'épargne rémunéré (Livret A, LEP, LDDS) : sans risque, disponible immédiatement.\n- ETFs ou fonds indiciels : idéal pour commencer en bourse à long terme.\n- Immobilier locatif ou SCPI : plus complexe mais très efficace sur 10 ans.`;
    }

    if (containsAny(['merci', 'super', 'genial', 'top', 'cool', 'excellent', 'bravo', 'nickel'])) {
      return `Avec plaisir ! C'est pour ça que je suis là.\n\nN'hésitez pas à revenir si vous avez d'autres questions sur vos finances. Rappelez-vous : votre solde actuel est de ${soldeStr} et votre épargne nette s'élève à ${epargneNetteStr}.\n\nContinuez comme ça et vous atteindrez vos objectifs financiers !`;
    }

    if (containsAny(['qui es tu', 'qui etes vous', 'c est quoi', 'keskestu', 'createur', 'cree par', 'application'])) {
      return `Je suis SamaCoach, l'intelligence artificielle financière intégrée dans l'application GestFina.\n\nMon rôle est de vous aider à mieux comprendre vos dépenses, optimiser vos budgets et prendre de meilleures décisions financières au quotidien.\n\nJ'ai accès à vos données financières en temps réel et je les analyse pour vous donner des conseils personnalisés. Votre solde actuel de ${soldeStr} est par exemple sur mon radar.`;
    }
    if (containsAny(['dettes', 'consolidation', 'remboursement'])) {
      return `Consolider vos dettes peut simplifier vos paiements et réduire les intérêts. Commencez par lister chaque dette, le taux d'intérêt et le montant restant. Priorisez celles avec les taux les plus élevés. Une fois consolidées, vous pourriez économiser jusqu'à 5-10% sur vos frais annuels.`;
    }

    if (containsAny(['score', 'credit', 'cote', 'fichier', 'historique'])) {
      return `Votre score de crédit influence vos capacités d'emprunt. Un bon score (au-dessus de 700) vous donne accès à des taux plus bas. Pour l'améliorer, payez toujours vos factures à temps, réduisez votre utilisation de crédit en dessous de 30% et évitez les demandes de crédit multiples.`;
    }

    if (containsAny(['stress', 'anxiété', 'mental', 'santé mentale'])) {
      return `Le stress financier est réel. Prenez un moment pour respirer, puis établissez un plan d'action simple : identifiez le poste qui cause le plus d'inquiétude, fixez un petit objectif d'économie (ex. 20€ par mois) et suivez vos progrès. Parler à un conseiller ou à un proche peut aussi aider à alléger la charge mentale.`;
    }

    if (containsAny(['famille', 'enfants', 'budget famille', 'dépenses familiales'])) {
      return `Gérer un budget familial nécessite de synchroniser les dépenses de tous. Créez une catégorie "Famille" et allouez-y un montant mensuel pour les besoins communs (courses, activités, éducation). Impliquez chaque membre dans le suivi pour plus de transparence et d'engagement.`;
    }

    if (containsAny(['eco', 'environnement', 'vert', 'durable', 'éco'])) {
      return `Adopter des gestes éco-responsables peut aussi économiser de l'argent : privilégiez les transports en commun ou le covoiturage, réduisez le gaspillage alimentaire, et choisissez des produits réutilisables. Même de petites économies s'additionnent sur le long terme.`;
    }

    

    if (containsAny(['fin du mois', 'fin de mois', 'bilan mensuel'])) {
      return `En fin de mois, c'est le bon moment pour faire le point !\n\nBilan rapide :\n- Revenus : `+totalIncomeStr+`\n- Depenses : `+totalExpensesStr+`\n- Epargne nette : `+epargneNetteStr+`\n- Solde : `+soldeStr+`\n\nSi vous etes dans le vert, envisagez de virer une partie vers votre livret ce soir !`;
    }

    if (containsAny(['mariage', 'noces', 'ceremonie', 'fiancaille', 'conjoint'])) {
      return `Un mariage coute en moyenne 10 000 a 20 000 euros. Commencez a epargner 18 a 24 mois a l'avance. Avec votre epargne nette de `+epargneNetteStr+`, calculez combien mettre de cote chaque mois et creez un budget dedie dans GestFina.`;
    }

    if (containsAny(['etudes', 'universite', 'fac', 'formation', 'diplome', 'cpf'])) {
      return `Investir dans l'education est toujours rentable ! Meme 30 euros par mois pendant 18 ans cree un capital solide pour vos enfants. Si c'est pour vous, regardez les formations eligibles au CPF. Votre solde de `+soldeStr+` est une base solide.`;
    }

    if (containsAny(['heritage', 'succession', 'notaire', 'testament', 'donation'])) {
      return `Recevoir un heritage ou planifier une succession necessite une strategie. Placez 60 a 70% dans un support securise (livret, assurance-vie) et 20 a 30% pour des projets. Consultez un notaire pour optimiser la fiscalite.`;
    }

    if (containsAny(['assurance', 'garantie', 'sinistre', 'couverture'])) {
      return `Verifiez au moins une fois par an vos contrats d'assurance (auto, habitation, sante). Regrouper vos assurances chez un meme assureur peut vous faire economiser 10 a 20% sur vos primes annuelles.`;
    }

    if (containsAny(['immobilier', 'proprietaire', 'achat immobilier', 'bien immobilier'])) {
      return `Devenir proprietaire necessite 3 points cles :\n- Apport : idealement 10 a 20% du prix du bien.\n- Mensualite : max 33% de vos revenus (`+totalIncomeStr+`).\n- Epargne de precaution : 3 a 6 mois de charges de cote apres l'achat.\n\nVotre solde de `+soldeStr+` est un bon depart.`;
    }

    if (containsAny(['transfert', 'western union', 'wave', 'orange money', 'virement international'])) {
      return `Pour les transferts internationaux, comparez les frais ! Wise, Remitly ou Wave sont souvent moins chers que Western Union. Des frais de 3 a 5% sur chaque envoi representent une grosse somme sur l'annee.`;
    }

    if (containsAny(['decouvert', 'agios', 'facilite de caisse'])) {
      return `Un decouvert peut depanner ponctuellement mais attention aux agios (15 a 20% APR) ! Si vous etes regulierement a decouvert, vos depenses (`+totalExpensesStr+`) depassent vos revenus (`+totalIncomeStr+`). Analysons ensemble ou couper.`;
    }

    if (containsAny(['neo banque', 'revolut', 'n26', 'changer de banque'])) {
      return `Les neo-banques (Revolut, N26, Orange Bank) proposent souvent des comptes gratuits avec d'excellents services. Si votre banque actuelle vous coute plus de 5 euros par mois sans contrepartie, il est peut-etre temps de changer !`;
    }

    if (containsAny(['inflation', 'pouvoir achat', 'tout est cher', 'prix augmente'])) {
      return `L'inflation erode votre pouvoir d'achat. Si elle est a 5%, votre argent perd 5% de valeur par an sur un compte courant.\n\nLa riposte : Livret A pour l'epargne de precaution, ETFs pour le long terme. Ne laissez pas votre solde de `+soldeStr+` perdre en valeur !`;
    }

    if (containsAny(['prime', 'bonus', 'treizieme mois', 'gratification'])) {
      return `Recevoir une prime ? Appliquez cette repartition :\n- 50% : Epargne ou remboursement accelere de dette.\n- 30% : Projet plaisir planifie.\n- 20% : Libre, sans culpabilite.\n\nVotre epargne nette de `+epargneNetteStr+` peut ainsi progresser serieusement.`;
    }

    if (containsAny(['etf', 'tracker', 'msci world', 'sp500', 'fonds indiciel'])) {
      return `Les ETFs sont l'outil prefere des investisseurs particuliers : diversifies, peu couteux et performants. Avec 50 a 100 euros par mois investis regulierement depuis votre epargne nette de `+epargneNetteStr+`, l'effet de capitalisation peut creer un capital solide sur 10 a 20 ans.`;
    }

    if (containsAny(['colocation', 'coinhabitation', 'partager logement', 'louer chambre'])) {
      return `La colocation peut diviser votre loyer par 2 ou 3 ! Avec les charges economisees, votre epargne nette de `+epargneNetteStr+` augmenterait significativement. C'est une solution temporaire tres efficace pour atteindre un objectif financier plus vite.`;
    }

    if (containsAny(['minimalisme', 'moins consommer', 'sobriete', 'essentiel'])) {
      return `Le minimalisme financier, c'est acheter moins mais mieux. Pour chaque achat, posez-vous : ai-je vraiment besoin de cela ? Puis-je trouver moins cher ou d'occasion ? Votre solde de `+soldeStr+` peut grossir rapidement juste en reduisant les achats impulsifs.`;
    }


    if (containsAny(['chomage', 'licencie', 'perdu emploi', 'sans emploi', 'pole emploi', 'chomeur'])) {
      return `Perdre son emploi est une epreuve difficile, mais c'est aussi un moment pour reorganiser ses finances.\n\nPremier reflexe : reduisez toutes les depenses non essentielles immediatement. Votre solde de `+soldeStr+` doit etre protege. Listez vos charges fixes incompressibles et identifiez ce qui peut etre suspendu (abonnements, loisirs) pour tenir plusieurs mois.`;
    }

    if (containsAny(['retraite anticipee', 'fire', 'liberte financiere', 'ne plus travailler', 'independance financiere'])) {
      return `La liberte financiere (methode FIRE) consiste a epargner et investir suffisamment pour que vos revenus passifs couvrent vos depenses. La regle du 4% dit que vous pouvez retirer 4% de votre capital chaque annee sans l'epuiser.\n\nVos depenses sont de `+totalExpensesStr+`. Pour etre financierement libre, visez un capital d'environ 25 fois ce montant annuel. Commencez par maximiser votre epargne nette de `+epargneNetteStr+` chaque mois.`;
    }

    if (containsAny(['energie', 'electricite', 'gaz', 'facture energie', 'chauffage'])) {
      return `Les factures d'energie sont l'un des postes les plus optimisables du budget !\n\n3 astuces pour les reduire :\n- Baissez le chauffage de 1 degre = 7% d'economies sur la facture.\n- Changez pour un fournisseur moins cher (comparez sur un comparateur en ligne).\n- Investissez dans des multiprises avec interrupteur pour eliminer les veilles electroniques.\n\nMeme 20 euros economises par mois, c'est 240 euros de plus dans votre epargne annuelle !`;
    }

    if (containsAny(['enfant', 'bebe', 'grossesse', 'naissance', 'accouchement', 'puericulture'])) {
      return `L'arrivee d'un enfant est une grande joie, mais aussi un changement financier majeur !\n\nPrevoyez en avance :\n- Un budget puericulture realiste (poussette, lit, vetements...).\n- Les aides auxquelles vous avez droit (CAF, conge parental, prime de naissance).\n- Une epargne dediee a l'avenir de votre enfant (assurance-vie, PEA junior).\n\nVotre solde actuel de `+soldeStr+` est votre point de depart pour ces preparations.`;
    }

    if (containsAny(['divorce', 'separation', 'rupture', 'partage des biens', 'ex'])) {
      return `Une separation est souvent couteuse financierement. Pensez a plusieurs choses :\n- Separez immediatement vos comptes bancaires joints.\n- Faites le point sur les dettes communes (qui doit quoi).\n- Consultez un conseiller juridique pour la repartition des biens.\n\nVotre bilan financier personnel montre un solde de `+soldeStr+`. Partir de cette base claire est essentiel pour repartir sur de bonnes bases.`;
    }

    if (containsAny(['side project', 'revente', 'vendre en ligne', 'marketplace', 'leboncoin', 'vinted', 'ebay'])) {
      return `Vendre des objets inutilises est l'un des moyens les plus rapides de generer du cash sans effort !\n\nLeboncoin, Vinted, Facebook Marketplace : chaque objet inutile chez vous est de l'argent potentiel. Une personne moyenne peut generer 200 a 500 euros en faisant le tri chez elle. Cet argent peut directement renforcer votre epargne nette de `+epargneNetteStr+`.`;
    }

    if (containsAny(['abonnement salle', 'gyms', 'app sport', 'fitness app', 'peloton', 'mycoach'])) {
      return `Un abonnement fitness non utilise est l'une des depenses les plus courantes gatement ! Avant de renouveler, verifiez : y etes-vous alle au moins 8 fois ce mois ?\n\nSi non, il existe d'excellentes alternatives gratuites : YouTube (chaines fitness), running en plein air, applications gratuites. Chaque euro economise augmente votre solde de `+soldeStr+`.`;
    }

    if (containsAny(['delegation', 'externaliser', 'sous-traiter', 'faire appel', 'prestataire', 'service'])) {
      return `Externaliser certaines taches peut parfois etre rentable ! La question est : le temps que vous passez vaut-il plus que le cout du service ?\n\nPar exemple, si votre temps vaut 30 euros de l'heure et qu'un livreur vous coute 5 euros, c'est un choix rationnel. Mais si cela devient une habitude, impactant vos depenses de `+totalExpensesStr+`, alors budgetisez-le explicitement dans GestFina.`;
    }

    if (containsAny(['renegocier', 'ren�gocier', 'taux credit', 'rachat credit', 'refinancer'])) {
      return `Ren�gocier votre credit immobilier ou consommation peut vous faire economiser des milliers d'euros !\n\nSi les taux ont baisse depuis votre emprunt initial, consultez votre banque ou un courtier pour un rachat de credit. Meme 0,5% de reduction sur un emprunt de 150 000 euros = economies de plusieurs milliers d'euros sur la duree totale.`;
    }

    if (containsAny(['renouveler', 'contrat', 'negocier abonnement', 'meilleur tarif', 'promo'])) {
      return `Renegocier vos contrats est une habitude financiere tres rentable !\n\nAppelez votre fournisseur internet, votre operateur telephone, votre assureur une fois par an avec la meme phrase : "J'ai une meilleure offre ailleurs, que pouvez-vous faire pour moi ?" Vous obtiendrez presque toujours une reduction ou une offre amelioree. Sur un an, cela peut representer 100 a 300 euros d'economies.`;
    }

    if (containsAny(['micro epargne', 'arrondi', 'spare change', 'tirelire intelligente', 'pennies'])) {
      return `La micro-epargne par arrondi est une technique puissante pour epargner sans s'en rendre compte !\n\nCertaines applications arrondissent chaque depense a l'euro superieur et mettent la difference de cote. Avec vos depenses de `+totalExpensesStr+`, meme 50 centimes par transaction peuvent generer plusieurs dizaines d'euros d'epargne supplementaire par mois.`;
    }

    if (containsAny(['calendrier financier', 'planification', 'calendrier', 'echeancier', 'planning'])) {
      return `Creer un calendrier financier mensuel est une des meilleures pratiques de gestion budgetaire !\n\nNotez les dates de toutes vos echeances (loyer, abonnements, factures, remboursements) sur un calendrier. Cela evite les oublis, les penalites de retard et vous donne une vision claire de votre tresorerie. Votre solde de `+soldeStr+` sera ainsi toujours maitrise.`;
    }

    return `Je suis SamaCoach, votre expert financier personnel, et je veille sur vos comptes !\n\nVotre solde actuel est de ${soldeStr}.\n\nJe suis capable de répondre à de nombreuses questions, par exemple :\n- "Quel est mon bilan financier ce mois-ci ?"\n- "Astuces pour économiser sur la nourriture"\n- "Puis-je m'offrir un voyage ce mois-ci ?"\n- "Comment investir mes premiers 500 euros ?"\n- "J'ai fait une dépense stupide, que faire ?"\n\nDites-moi ce qui vous préoccupe, je suis là pour vous aider.`;
  }
}
