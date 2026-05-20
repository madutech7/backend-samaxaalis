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
   * Génère le texte de contexte financier pour l'utilisateur
   */
  private async buildFinancialContext(userId: string): Promise<string> {
    const txResponse = await this.transactionsService.findAll(userId, { limit: 1000 });
    const transactions = txResponse.data;
    const budgets = await this.budgetsService.findAll(userId);

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
        `- Catégorie ${b.category} : budget de ${b.limitAmount} €, dépensé ${spent.toFixed(2)} € (${progress.toFixed(1)}% consommé)`,
      );
    }

    // Top transactions récentes
    const recentTxs = [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10)
      .map((t) => `- ${new Date(t.date).toLocaleDateString('fr-FR')} | ${t.title} : ${t.type === 'income' ? '+' : '-'}${t.amount} € (${t.category})`);

    const context = `
=== CONTEXTE FINANCIER DE L'UTILISATEUR ===
- Total Revenus : ${totalIncome.toFixed(2)} €
- Total Dépenses : ${totalExpenses.toFixed(2)} €
- Épargne Nette : ${netSavings.toFixed(2)} € (Taux d'épargne : ${savingsRate.toFixed(1)}%)
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
  async generateAnalysis(userId: string): Promise<AIAnalysisResponse> {
    const context = await this.buildFinancialContext(userId);

    if (!this.genAI) {
      return this.generateMockAnalysis(context);
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' },
      });

      const prompt = `
Tu es SamaCoach, un conseiller financier IA bienveillant, motivant et expert.
Analyse le contexte financier de l'utilisateur ci-dessous et produis un rapport structuré en français.
Il est extrêmement important de n'utiliser AUCUN émoji ou symbole superflu dans tes descriptions, tes résumés et tes conseils pour conserver un style sobre, épuré et professionnel de type Apple.

${context}

Génère une réponse JSON strict selon ce schéma :
{
  "financialScore": number (de 0 à 100, représentant la santé financière générale),
  "summary": "string" (un court résumé global personnalisé et encourageant, 2-3 phrases, adressé à l'utilisateur directement),
  "savingsRateComment": "string" (une analyse du taux d'épargne de l'utilisateur avec conseils),
  "insights": [
    { "title": "string", "description": "string", "type": "positive" | "negative" | "warning" }
  ] (maximum 3 insights clés basés sur les budgets ou transactions),
  "recommendations": ["string"] (exactement 3 conseils spécifiques et actionnables pour optimiser ses finances)
}
`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      return JSON.parse(responseText) as AIAnalysisResponse;
    } catch (err) {
      this.logger.error('❌ Erreur lors de l\'appel à Gemini pour l\'analyse:', err);
      return this.generateMockAnalysis(context);
    }
  }

  /**
   * Gère le chat interactif avec le coach
   */
  async chatWithCoach(
    userId: string,
    message: string,
    history?: ChatMessageDto[],
  ): Promise<string> {
    const context = await this.buildFinancialContext(userId);

    if (!this.genAI) {
      return this.generateMockChatResponse(message, context);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      // Convertir l'historique au format Gemini
      const geminiHistory = (history ?? []).map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      // Insérer le contexte au départ
      const systemInstruction = `
Tu es SamaCoach, un coach en finances personnelles intelligent et chaleureux. 
Tu aides l'utilisateur à comprendre ses dépenses, optimiser ses budgets et épargner pour ses projets.
Voici les données financières réelles de l'utilisateur pour éclairer tes réponses :
${context}

Réponds de manière concise, structurée (avec des puces si nécessaire), constructive et toujours en français.
Considère ces données comme confidentielles et affiche de l'empathie.
Il est strictement interdit d'utiliser des émojis ou des symboles superflus dans tes réponses pour conserver un style sobre, haut de gamme et épuré de type Apple.
      `;

      const chatSession = model.startChat({
        history: [
          { role: 'user', parts: [{ text: `Système: Applique ces instructions pour toutes nos réponses futures:\n${systemInstruction}` }] },
          { role: 'model', parts: [{ text: 'Entendu. Je suis SamaCoach, votre coach financier. Je prends en compte votre situation financière actuelle pour vous guider au mieux. Comment puis-je vous aider aujourd\'hui ?' }] },
          ...geminiHistory,
        ],
      });

      const result = await chatSession.sendMessage(message);
      return result.response.text();
    } catch (err) {
      this.logger.error('❌ Erreur lors du chat avec Gemini:', err);
      return this.generateMockChatResponse(message, context);
    }
  }

  // MARK: - Mocks & Fallbacks

  private generateMockAnalysis(context: string): AIAnalysisResponse {
    this.logger.log('⚠️ Génération d\'une analyse simulée (mode fallback)...');
    
    // Extraction rapide de quelques données pour personnaliser le mock
    const hasHighExpenses = context.includes('Total Dépenses : ') && 
      parseFloat(context.split('Total Dépenses : ')[1]) > parseFloat(context.split('Total Revenus : ')[1]) * 0.8;
    
    const rateStr = context.split('Taux d\'épargne : ')[1]?.split('%')[0] ?? '25';
    const rate = parseFloat(rateStr);

    let score = 75;
    let summary = "Votre gestion budgétaire est saine ce mois-ci. Vous parvenez à maintenir un équilibre positif entre vos revenus et vos charges récurrentes.";
    let rateComment = `Votre taux d'épargne se situe à ${rate.toFixed(1)}%. C'est un bon début qui respecte la règle d'or d'épargner au moins 10 à 20% de vos gains.`;
    
    const insights: AIInsight[] = [
      {
        title: "Suivi rigoureux",
        description: "Vos transactions sont régulièrement saisies, ce qui fiabilise grandement vos prévisions budgétaires.",
        type: "positive"
      }
    ];

    if (hasHighExpenses) {
      score = 58;
      summary = "Attention Madu, vos dépenses récentes sont élevées par rapport à vos rentrées d'argent. Il serait judicieux de limiter vos sorties non indispensables pour le reste du mois.";
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
        "Essayez de différer de 48h tout achat impulsif supérieur à 50 € afin de valider son utilité réelle."
      ]
    };
  }

  private generateMockChatResponse(message: string, context: string): string {
    const msg = message.toLowerCase();
    
    if (msg.includes('ps5') || msg.includes('acheter') || msg.includes('achat')) {
      return `Acheter un plaisir comme une PS5 dépend de vos priorités actuelles. \n\nEn analysant vos données : 
- Votre solde disponible et votre taux d'épargne ce mois-ci vous donnent une idée de votre reste à vivre.
- Si vous avez déjà constitué un **fonds d'urgence** de 3 à 6 mois de dépenses, vous pouvez tout à fait vous l'offrir en créant une ligne de budget "Loisirs" spécifique.
- Sinon, je vous conseille d'épargner sur 2 ou 3 mois pour amortir cet achat sans impacter vos dépenses courantes (Alimentation, Logement).`;
    }
    
    if (msg.includes('nourriture') || msg.includes('aliment') || msg.includes('manger')) {
      return `Le budget alimentation est souvent le plus facile à optimiser sans perdre en qualité de vie. Voici 3 astuces rapides :
1. **Le Batch Cooking** : Préparez vos repas de la semaine le dimanche pour éviter d'acheter des plats à emporter coûteux le midi.
2. **Faites une liste stricte** : N'allez jamais faire vos courses le ventre vide et tenez-vous rigoureusement à votre liste.
3. **Privilégiez les marques blanches** pour les produits de base (pâtes, riz, produits d'entretien) où la différence de qualité est minime mais l'économie est de 30% en moyenne.`;
    }

    if (msg.includes('economi') || msg.includes('épargn') || msg.includes('réduire')) {
      return `Pour augmenter votre taux d'épargne (actuellement reflété dans vos métriques globales), je vous suggère la méthode des **50/30/20** :
- **50%** pour vos besoins essentiels (loyer, factures, alimentation).
- **30%** pour vos envies (sorties, shopping, loisirs).
- **20%** directement versés en épargne ou investissement dès le début du mois.

Si vous souhaitez réduire vos charges, commencez par lister vos abonnements (streaming, salles de sport, applications) et résiliez ceux qui n'ont pas servi ces 30 derniers jours. C'est souvent 30 à 50 € de gagnés immédiatement !`;
    }

    return `Bonjour ! En tant que votre coach financier **SamaCoach**, j'analyse en continu vos transactions pour vous conseiller. \n\nVotre question concerne un point budgétaire spécifique. N'hésitez pas à me demander des précisions sur :
- Comment optimiser une catégorie (Alimentation, Shopping, etc.).
- Si vous pouvez réaliser un achat important en ce moment.
- Des explications sur les meilleures règles d'épargne personnelle.`;
  }
}
