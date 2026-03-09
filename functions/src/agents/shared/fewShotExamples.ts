/**
 * Static Few-Shot Examples for JSON-Producing LLM Prompts
 *
 * Each constant is a JSON string matching its corresponding Zod schema exactly.
 * Imported by prompt builders in dialecticalPrompts.ts, metaReflection.ts,
 * claimExtraction.ts, gapAnalysis.ts, and answerGeneration.ts.
 *
 * If a schema changes, update the example here and run
 * `pnpm test -- fewShotExamples` to verify.
 */

// ----- CompactGraph (thesis prompts — dialectical + deep research) -----

export const COMPACT_GRAPH_EXAMPLE: string = JSON.stringify(
  {
    nodes: [
      {
        id: 'n1',
        label: 'Urban heat island intensity rising 2-3C per decade',
        type: 'claim',
        note: 'Based on satellite thermal data; varies by city morphology',
        sourceId: 'src_1',
        sourceUrl: 'https://example.com/uhi-study',
        sourceConfidence: 0.88,
      },
      {
        id: 'n2',
        label: 'Impervious surface coverage drives heat retention',
        type: 'mechanism',
      },
      {
        id: 'n3',
        label: 'Heat-related hospital admissions correlate with UHI',
        type: 'claim',
        sourceId: 'src_2',
        sourceUrl: 'https://example.com/health-data',
        sourceConfidence: 0.76,
      },
      {
        id: 'n4',
        label: 'Green infrastructure as thermal regulation mechanism',
        type: 'concept',
      },
      {
        id: 'n5',
        label: 'Falsified if UHI decouples from surface ratio by 2030',
        type: 'prediction',
        note: 'Threshold: r < 0.3 in regression',
      },
    ],
    edges: [
      { from: 'n2', to: 'n1', rel: 'causes', weight: 0.85 },
      { from: 'n1', to: 'n3', rel: 'causes', weight: 0.72 },
      { from: 'n4', to: 'n1', rel: 'mediates', weight: 0.65 },
      { from: 'n4', to: 'n3', rel: 'supports', weight: 0.55 },
    ],
    summary:
      'Urban heat islands driven by impervious surfaces increase heat-related health risks; green infrastructure mediates',
    reasoning:
      'The thermal mechanism is well-established but the health pathway involves confounders (income, AC access, age) that weaken direct causal attribution. Green infrastructure shows promise but evidence is largely from temperate climates.',
    confidence: 0.74,
    regime: 'Mid-latitude cities >500k population, temperate or subtropical',
    temporalGrain: 'years',
  },
  null,
  2
)

// ----- NegationOutput (cross-negation — dialectical + deep research) -----

export const NEGATION_OUTPUT_EXAMPLE: string = JSON.stringify(
  {
    internalTensions: [
      'Node n1 vs Node n3: UHI intensity is rising but health data does not control for AC penetration, masking the true health impact.',
      'Node n2 vs Node n4: Impervious surface coverage and green infrastructure are presented independently but green corridors built on former impervious surfaces confound both.',
    ],
    categoryAttacks: [
      "The category 'mechanism' for n2 assumes linear causation, but thermal dynamics involve non-linear feedback loops (albedo, canyon geometry, anthropogenic heat) that the thesis ignores.",
      'Framing UHI purely as surface-cover misses atmospheric boundary layer effects and regional wind patterns that modulate urban-rural temperature differentials.',
    ],
    preservedValid: [
      'The correlation between impervious surfaces and elevated temperatures (n1-n2 edge) is empirically robust across dozens of cities.',
    ],
    rivalFraming:
      'Urban thermal health risk is better understood as an equity problem — heat exposure maps onto income, housing quality, and outdoor labor, making surface cover a proxy for socioeconomic vulnerability.',
    rewriteOperator: 'ADD_MEDIATOR',
    operatorArgs: {
      mediatorLabel: 'Socioeconomic vulnerability index',
      targetEdge: 'n1-n3',
    },
  },
  null,
  2
)

// ----- GraphSublationOutput (sublation — dialectical + deep research) -----

export const SUBLATION_OUTPUT_EXAMPLE: string = JSON.stringify(
  {
    mergedGraph: {
      nodes: [
        {
          id: 'n1',
          label: 'Urban heat island intensity rising 2-3C per decade',
          type: 'claim',
          sourceId: 'src_1',
          sourceUrl: 'https://example.com/uhi-study',
          sourceConfidence: 0.88,
        },
        {
          id: 'n2',
          label: 'Impervious surface coverage drives heat retention',
          type: 'mechanism',
        },
        {
          id: 'n3',
          label: 'Heat-related hospital admissions correlate with UHI',
          type: 'claim',
          note: 'Confounded by AC penetration and income — see n6',
          sourceId: 'src_2',
          sourceUrl: 'https://example.com/health-data',
          sourceConfidence: 0.76,
        },
        {
          id: 'n4',
          label: 'Green infrastructure as thermal regulation',
          type: 'concept',
        },
        {
          id: 'n6',
          label: 'Socioeconomic vulnerability mediates heat-health',
          type: 'mechanism',
          note: 'Synthesized from negation critique',
        },
        {
          id: 'n7',
          label: 'Falsified if vulnerability shows no heat correlation',
          type: 'prediction',
          note: 'Threshold: r < 0.2 in controlled study by 2028',
        },
      ],
      edges: [
        { from: 'n2', to: 'n1', rel: 'causes', weight: 0.85 },
        { from: 'n1', to: 'n6', rel: 'causes', weight: 0.7 },
        { from: 'n6', to: 'n3', rel: 'mediates', weight: 0.68 },
        { from: 'n4', to: 'n1', rel: 'mediates', weight: 0.65 },
      ],
      summary:
        'UHI drives health impacts through socioeconomic vulnerability pathways, not direct thermal exposure alone',
      reasoning:
        'Synthesis resolves the tension between thermal and equity framings by inserting vulnerability as a mediator. Preserves the robust UHI-surface relationship while acknowledging health outcomes depend on adaptive capacity.',
      confidence: 0.71,
      regime: 'Mid-latitude cities >500k, temperate/subtropical',
      temporalGrain: 'years',
    },
    diff: {
      addedNodes: ['n6', 'n7'],
      removedNodes: ['n5'],
      addedEdges: [
        { from: 'n1', to: 'n6', rel: 'causes' },
        { from: 'n6', to: 'n3', rel: 'mediates' },
      ],
      removedEdges: [{ from: 'n1', to: 'n3', rel: 'causes' }],
      modifiedNodes: [
        {
          id: 'n3',
          oldLabel: 'Heat-related hospital admissions correlate with UHI',
          newLabel: 'Heat-related hospital admissions correlate with UHI',
        },
      ],
      resolvedContradictions: ['Direct UHI-health causation vs confounding by AC penetration'],
      newContradictions: [],
    },
    resolvedContradictions: [
      "Resolved 'UHI directly causes health admissions' vs 'AC penetration masks impact' by inserting socioeconomic vulnerability (n6) as mediator.",
    ],
  },
  null,
  2
)

// ----- MetaReflection (dialectical meta-reflection decision) -----

export const META_REFLECTION_EXAMPLE: string = JSON.stringify(
  {
    decision: 'CONTINUE',
    reasoning:
      'Two HIGH-severity contradictions remain unresolved (direct vs mediated causation, temporal scope disagreement). Learning rate is positive at 12% and velocity at 0.042 exceeds threshold. Coverage is 0.61, below the 0.80 target. One more cycle focused on resolving the temporal scope contradiction would meaningfully improve synthesis.',
    focusAreas: [
      'Resolve temporal scope contradiction between years and decades grain',
      'Find corroborating evidence for socioeconomic vulnerability mediator',
    ],
  },
  null,
  2
)

// ----- ClaimExtraction (single-source — deep research) -----

export const CLAIM_EXTRACTION_EXAMPLE: string = JSON.stringify(
  {
    claims: [
      {
        claimText: 'Urban green spaces reduce ambient temperature by 1-4C within a 200m radius',
        confidence: 0.85,
        evidenceType: 'empirical',
        sourceQuote:
          'parks and green corridors reduced local temperatures by 1-4C compared to surrounding built-up areas',
        concepts: ['urban green spaces', 'ambient temperature', 'thermal regulation'],
      },
      {
        claimText:
          'The cooling effect of urban vegetation may be diminished during drought conditions',
        confidence: 0.55,
        evidenceType: 'theoretical',
        sourceQuote: 'evapotranspiration-driven cooling is contingent on adequate soil moisture',
        concepts: ['urban vegetation', 'drought', 'evapotranspiration'],
      },
    ],
  },
  null,
  2
)

// ----- BatchClaimExtraction (multi-source — deep research) -----

export const BATCH_CLAIM_EXTRACTION_EXAMPLE: string = JSON.stringify(
  {
    claims: [
      {
        sourceIndex: 1,
        claimText: 'Urban tree canopy cover above 30% reduces peak summer temperatures by 2-5C',
        confidence: 0.82,
        evidenceType: 'empirical',
        sourceQuote: 'cities with >30% canopy cover showed 2-5C lower peak temps',
        concepts: ['tree canopy', 'summer temperature', 'urban cooling'],
      },
      {
        sourceIndex: 2,
        claimText:
          'Reflective pavement coatings may increase pedestrian thermal discomfort despite lowering surface temperature',
        confidence: 0.6,
        evidenceType: 'empirical',
        sourceQuote:
          'reflected shortwave radiation increased mean radiant temperature at pedestrian height',
        concepts: ['reflective pavement', 'thermal comfort', 'mean radiant temperature'],
      },
    ],
  },
  null,
  2
)

// ----- GapAnalysis (deep research) -----

export const GAP_ANALYSIS_EXAMPLE: string = JSON.stringify(
  {
    gaps: [
      {
        description:
          'No evidence on UHI effects in arid or tropical climates — all claims reference temperate cities',
        missingEvidenceFor: ['tropical UHI', 'arid climate heat islands'],
        uncertaintyScore: 0.8,
        suggestedQueries: [
          'urban heat island tropical cities health impacts',
          'arid climate UHI mitigation study',
        ],
        priority: 'high',
      },
      {
        description:
          'Green infrastructure cost-effectiveness claim supported by a single municipal report',
        missingEvidenceFor: ['green infrastructure ROI'],
        uncertaintyScore: 0.6,
        suggestedQueries: ['meta-analysis green infrastructure cost effectiveness urban cooling'],
        priority: 'medium',
      },
    ],
    overallCoverageScore: 0.55,
    shouldContinue: true,
  },
  null,
  2
)

// ----- AnswerGeneration (deep research) -----

export const ANSWER_GENERATION_EXAMPLE: string = JSON.stringify(
  {
    directAnswer:
      'Urban heat islands significantly increase heat-related health risks, but the pathway is mediated by socioeconomic factors rather than direct thermal exposure alone. Cities with high impervious surface coverage experience 2-3C higher temperatures [src_1](https://example.com/uhi-study), correlating with increased hospital admissions [src_2](https://example.com/health-data). However, adaptive capacity — access to air conditioning, housing quality, outdoor labor exposure — mediates whether elevated temperatures translate into health outcomes.\n\nGreen infrastructure interventions show measurable cooling effects of 1-4C within 200m [src_3](https://example.com/green-infra), though effectiveness varies by climate zone and maintenance regime.',
    supportingClaims: [
      {
        claimText:
          'Impervious surface coverage correlates with UHI intensity at r=0.78 across 42 cities',
        confidence: 0.88,
        sources: ['https://example.com/uhi-study'],
        evidenceType: 'empirical',
      },
    ],
    counterclaims: [
      {
        claimText:
          'Rising AC penetration may mask the health signal of UHI in developed-world cities',
        confidence: 0.65,
        sources: ['https://example.com/ac-study'],
      },
    ],
    openUncertainties: [
      'UHI health effects in tropical and arid climates are unstudied',
      'Long-term maintenance costs of green infrastructure may limit scalability',
    ],
    confidenceAssessment: {
      overall: 0.72,
      byTopic: {
        'UHI thermal mechanism': 0.88,
        'Health impact pathway': 0.65,
        'Green infrastructure effectiveness': 0.6,
      },
    },
    citations: [
      {
        sourceId: 'src_1',
        url: 'https://example.com/uhi-study',
        title: 'Global UHI Meta-Analysis 2024',
        relevance: 'Primary evidence for surface-temperature relationship',
      },
    ],
    knowledgeGraphSummary: {
      claimCount: 24,
      conceptCount: 15,
      contradictionCount: 3,
      resolvedCount: 2,
    },
  },
  null,
  2
)

// ----- SenseMaking (deep research planner node) -----

export const SENSE_MAKING_EXAMPLE: string = JSON.stringify(
  {
    canonicalGoal:
      'Evaluate how urban heat islands affect public health outcomes and what mitigation strategies are most effective',
    coreQuestion:
      'What is the causal pathway from urban heat islands to health outcomes, and which interventions have strongest evidence?',
    subquestions: [
      'What is the magnitude of UHI effect across different climate zones?',
      'Which populations are most vulnerable to UHI-related health impacts?',
      'How cost-effective are green infrastructure interventions vs reflective surfaces?',
    ],
    keyConcepts: [
      'urban heat island',
      'heat-related mortality',
      'green infrastructure',
      'impervious surfaces',
      'thermal comfort',
    ],
    verificationTargets: [
      'UHI intensity correlates with hospital admissions (r > 0.5)',
      'Green infrastructure reduces ambient temperature by >1C within 200m',
      'Socioeconomic factors confound UHI-health correlations',
    ],
    plannerRationale:
      'The query spans climate science, public health, and urban planning. Starting with meta-analyses and systematic reviews to establish baseline evidence, then targeted searches for intervention effectiveness and equity dimensions.',
    searchPlan: {
      serpQueries: [
        'urban heat island health impacts meta-analysis',
        'green infrastructure cooling effectiveness cities',
        'heat vulnerability socioeconomic factors urban',
      ],
      scholarQueries: [
        'urban heat island mortality morbidity systematic review',
        'cool roofs green roofs urban temperature reduction RCT',
      ],
      semanticQueries: [
        'relationship between impervious surfaces and heat-related hospital admissions',
        'equity dimensions of urban heat exposure',
      ],
      rationale:
        'Prioritizing systematic reviews and meta-analyses for the core question, then intervention studies for mitigation strategies, and equity-focused queries to test the socioeconomic confounding hypothesis.',
      targetSourceCount: 12,
    },
  },
  null,
  2
)

// ----- SynthesisNegation (sublation engine critique) -----

export const SYNTHESIS_NEGATION_EXAMPLE: string = JSON.stringify(
  {
    critiques: [
      'The target synthesis drops n4 (green infrastructure) entirely despite it having a robust mediates edge to n1 with weight 0.65 — this removes a key intervention mechanism.',
      'The resolution of the UHI-health contradiction oversimplifies by removing the direct thermal pathway; evidence supports both direct and mediated effects.',
    ],
    missingElements: [
      'Green infrastructure as thermal regulation mechanism (n4) — present in 2 of 3 thesis graphs with consistent edge structure',
      'Prediction node for falsification threshold (n5) — important for epistemic rigor',
    ],
    overreaches: [
      'Claims socioeconomic vulnerability fully mediates the UHI-health pathway, but original theses only showed partial mediation (r drops from 0.72 to 0.35, not to zero)',
    ],
    proposedRefinements: [
      {
        type: 'ADD_MEDIATOR',
        target: 'n1-n3 edge',
        args: { mediatorLabel: 'Green infrastructure access inequality' },
        rationale:
          'Restores the green infrastructure pathway while connecting it to the equity framing — neighborhoods with less green space are both hotter and lower income',
      },
    ],
  },
  null,
  2
)
