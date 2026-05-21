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
        model: 'gemini-2.5-flash',
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
8. CONNAISSANCE DE L'APPLICATION : L'utilisateur navigue sur l'application "Gestfina" (ou "SamaXaalis"). Tu as l'OBLIGATION ABSOLUE de répondre de manière détaillée et experte à n'importe quelle question concernant le fonctionnement de l'application (ex: "comment ajouter une dépense", "où trouver mes graphiques", "à quoi sert l'abonnement pro", "comment utiliser les budgets", "mes données sont-elles sécurisées", "Face ID"). Tu es le guide ultime de l'application, ne dis JAMAIS que tu ne peux pas répondre à une question sur l'application.
      `;

      // Utilisation native de systemInstruction pour que Gemini applique les consignes à chaque tour de chat
      const model = this.genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
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
    const soldeStr = context.split('Solde Actuel : ')[1]?.split('\n')[0]?.trim() ?? `0.00 ${symbol}`;
    const totalIncomeStr = context.split('Total Revenus : ')[1]?.split('\n')[0]?.trim() ?? `0.00 ${symbol}`;
    const totalExpensesStr = context.split('Total Dépenses : ')[1]?.split('\n')[0]?.trim() ?? `0.00 ${symbol}`;

    if (msg.includes('solde') || msg.includes('argent') || msg.includes('compte') || msg.includes('combien') || msg.includes('avoir')) {
      return `Votre solde actuel s'élève à ${soldeStr}.\n\nVoici le résumé rapide de votre situation :\n- Total des Revenus : ${totalIncomeStr}\n- Total des Dépenses : ${totalExpensesStr}\n\nComment puis-je vous aider à optimiser ce budget aujourd'hui ?`;
    }
    
    if (msg.includes('dernier') || msg.includes('derniere') || msg.includes('dernière') || msg.includes('récente') || msg.includes('recente')) {
      const txsMatch = context.split('- 10 Transactions Récentes :\n')[1]?.split('================================')[0];
      if (txsMatch) {
         const lines = txsMatch.trim().split('\n');
         const lastTx = lines.find(l => l.startsWith('- '));
         if (lastTx) {
             return `Votre toute dernière transaction enregistrée est :\n${lastTx.replace('- ', '')}\n\nVotre solde actuel est de ${soldeStr}.`;
         }
      }
      return `Je n'ai pas trouvé de transactions récentes dans votre historique.\n\nVotre solde actuel est de ${soldeStr}.`;
    }
    
    if (msg.includes('ps5') || msg.includes('acheter') || msg.includes('achat')) {
      return `Acheter un plaisir dépend de vos priorités actuelles. \n\nEn analysant vos données : \n- Votre solde disponible de ${soldeStr} et votre taux d'épargne vous donnent une idée de votre reste à vivre.\n- Si vous avez déjà constitué un fonds d'urgence de 3 à 6 mois de dépenses, vous pouvez tout à fait vous l'offrir en créant une ligne de budget Loisirs spécifique.\n- Sinon, je vous conseille d'épargner sur 2 ou 3 mois pour amortir cet achat sans impacter vos dépenses courantes.`;
    }
    
    if (msg.includes('nourriture') || msg.includes('aliment') || msg.includes('manger') || msg.includes('courses')) {
      return `Le budget alimentation est souvent le plus facile à optimiser sans perdre en qualité de vie. Voici 3 astuces rapides :\n- Le Batch Cooking : Préparez vos repas de la semaine le dimanche.\n- Faites une liste stricte : N'allez jamais faire vos courses le ventre vide.\n- Privilégiez les marques blanches pour les produits de base où la différence de qualité est minime.`;
    }

    if (msg.includes('economi') || msg.includes('épargn') || msg.includes('réduire')) {
      return `Pour augmenter votre taux d'épargne, je vous suggère la méthode des 50/30/20 :\n- 50% pour vos besoins essentiels.\n- 30% pour vos envies.\n- 20% directement versés en épargne.\n\nSi vous souhaitez réduire vos charges, commencez par lister vos abonnements et résiliez ceux qui n'ont pas servi ces 30 derniers jours.`;
    }

    return `Bonjour Madu. En tant que votre coach financier SamaCoach, j'analyse en continu vos transactions.\n\nVotre solde actuel est de ${soldeStr}.\n\nN'hésitez pas à me poser des questions sur :\n- Comment optimiser vos catégories de dépenses.\n- Si vous pouvez réaliser un achat important en ce moment.\n- Des explications sur les meilleures règles d'épargne personnelle.\n- Votre dernière transaction.`;
  }
}
