# Oracle Axiom Cookbook v1.0

**The difference between a library and a cookbook:** a library is organized by _what axioms are_ (domain). A cookbook is organized by _what you're trying to figure out_ (analytical question). Same ingredients, different access pattern — from taxonomy to workflow.

**Three layers:**

- **Layer 1 — Recipes** (21 structured analytical workflows, organized by question)
- **Layer 2 — Techniques** (15 reusable reasoning patterns)
- **Layer 3 — Pantry** (142 axioms, reverse-indexed to recipes and techniques)

---

## Quick Reference: Which Recipe Do I Need?

| I'm trying to figure out...                                                         | Recipe                                                           | Phase                     |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------- |
| Given an industry or market, decompose the structural forces that produced the c... | **A1** Why is this market structured this way?                   | Phase 1, Phase 2          |
| Given organizational behavior that seems irrational or suboptimal, find the stru... | **A2** Why does this organization behave this way?               | Phase 1, Phase 3          |
| When something seems like it should have already happened but hasn't, find the h... | **A3** Why hasn't this obvious improvement happened?             | Phase 1, Phase 2          |
| In any system with multiple potential bottlenecks, identify the ONE constraint t... | **A4** What is the binding constraint?                           | Phase 1, Phase 3          |
| Given an observed trend, assess where it sits on its trajectory, what limits it ... | **B1** Where is this trend heading?                              | Phase 2                   |
| When a capability becomes dramatically cheaper (typically via AI or technology),... | **B2** What happens when this gets cheaper/faster/easier?        | Phase 2, Phase 3          |
| Model how rational actors (competitors, regulators, customers, employees) will r... | **B3** How will actors respond to this change?                   | Phase 3                   |
| Given a new technology, practice, or standard, assess whether it will achieve br... | **B4** Will this adoption succeed or stall?                      | Phase 2, Phase 3          |
| Map the reinforcing and balancing feedback loops in a system, identify which loo... | **B5** What feedback loops are at play?                          | Phase 1, Phase 3          |
| The Inversion recipe. Instead of arguing FOR the scenario, systematically identi... | **C1** What would make this scenario impossible?                 | Phase 3                   |
| When a scenario involves an extreme or transformative outcome, assess whether th... | **C2** Is this extreme outcome plausible?                        | Phase 3                   |
| Systematically identify blind spots in the analysis. What evidence is missing, w... | **C3** What are we not seeing?                                   | Phase 1, Phase 2, Phase 3 |
| For any proposed response to a scenario (policy, strategy, investment), check wh... | **C4** Will this intervention backfire?                          | Phase 3                   |
| For any quantitative claim or timeline estimate, check whether it's an informed ... | **D1** Is this estimate anchored or calibrated?                  | Phase 1, Phase 2, Phase 3 |
| Separate narrative quality (how compelling the scenario reads) from structural q... | **D2** Are we confusing good story with good evidence?           | Phase 3                   |
| When models or evaluators agree, check whether the agreement reflects genuine co... | **D3** Is this consensus real or manufactured?                   | Phase 1, Phase 2, Phase 3 |
| Different types of claims warrant different confidence levels. Match confidence ... | **D4** What's the right confidence level for this type of claim? | Phase 1, Phase 2, Phase 3 |
| Identify actions that are beneficial across most scenarios, have bounded downsid... | **E1** What are the no-regret moves?                             | Phase 3                   |
| Identify small, specific investments NOW that create the ability (not obligation... | **E2** Where are the options to buy?                             | Phase 3                   |
| Via Negativa for strategy. Identify current activities, assumptions, and investm... | **E3** What should we stop doing?                                | Phase 3                   |
| Trace how the competitive structure of an industry will change under each scenar... | **E4** How will the competitive landscape reshape?               | Phase 3                   |

---

# Layer 1 — Recipes

## Category A: "Why is it this way?" — Structure Analysis

_Primary phase: Phase 1_

### Recipe A1: Why is this market structured this way?

**Question:** Given an industry or market, decompose the structural forces that produced the current configuration: who has power, why, and what holds it in place.

**When to use:** Phase 1 decomposition of any market, industry, or competitive landscape. Also useful in Phase 2 when assessing whether a trend could reshape market structure.

**Oracle phases:** Phase 1, Phase 2  
**Oracle agents:** Decomposer, Systems Mapper

**Steps:**

**Step 1: Map the basic economics**
_Axioms:_ AXM-058 (Supply and Demand Equilibrium), AXM-014 (Economies of Scale), AXM-015 (Diseconomies of Scale)
Start with Supply and Demand Equilibrium (AXM-058). What determines supply? What determines demand? Where is the current equilibrium? Then check for Economies of Scale (AXM-014) — do larger players have structural cost advantages? At what point do Diseconomies of Scale (AXM-015) emerge?

**Step 2: Check for network effects and platform dynamics**
_Axioms:_ AXM-038 (Network Effects (Direct and Indirect)), AXM-005 (Metcalfe's Law), AXM-061 (Two-Sided Markets / Platform Economics)
Are there Direct or Indirect Network Effects (AXM-038)? If so, does Metcalfe's Law (AXM-005) apply? Is this a Two-Sided Market (AXM-061)? Network effects + economies of scale often explain concentration.

**Step 3: Assess switching costs and lock-in**
_Axioms:_ AXM-062 (Switching Costs), AXM-036 (Path Dependence), AXM-049 (Winner-Take-All / Winner-Take-Most Markets)
What are the Switching Costs (AXM-062) — financial, learning, data, relationship? Is there Path Dependence (AXM-036) that makes the current structure sticky? Does this create Winner-Take-All dynamics (AXM-049)?

**Step 4: Identify the firm boundary logic**
_Axioms:_ AXM-003 (Coase's Theory of the Firm), AXM-051 (Asymmetric Information (Akerlof's Lemons)), AXM-016 (Principal-Agent Problem)
Apply Coase's Theory (AXM-003): why are certain activities inside firms vs. outsourced? Is there Asymmetric Information (AXM-051) that prevents efficient market transactions? Are there Principal-Agent Problems (AXM-016) that shape vertical integration decisions?

**Step 5: Map power and competitive dynamics**
_Axioms:_ AXM-060 (Complementary Goods Dynamics), AXM-064 (Wardley Mapping (Value Chain Evolution)), AXM-017 (Comparative Advantage)
What are the Complementary Goods (AXM-060) relationships? Who is commoditizing whose complement? Use Wardley Mapping logic (AXM-064) to place components on the evolution axis. Where does each player's Comparative Advantage (AXM-017) lie?

**Techniques used:** T01 (Incentive Chain Tracing), T12 (Stakeholder Incentive Map), T10 (Boundary Condition Check)

**Traps to watch for:**

- _Assuming the current structure is stable_ → Check for Path Dependence (AXM-036) + Tipping Points (AXM-037) — stable ≠ permanent. Ask: what would shift the binding constraint?
- _Confusing correlation with causation in market structure_ → Use Chesterton's Fence (AXM-128) — understand why the structure exists before assuming it's inefficient.
- _Survivorship Bias_ → Check AXM-054: are you studying the market as shaped by survivors? What about the companies/models that failed?

**Output template:** Market structure analysis: (1) Dominant economic forces, (2) Network/platform dynamics if present, (3) Lock-in mechanisms, (4) Firm boundary logic, (5) Power distribution and Wardley position, (6) Structural stability assessment — what holds it in place and what could shift it.

---

### Recipe A2: Why does this organization behave this way?

**Question:** Given organizational behavior that seems irrational or suboptimal, find the structural explanation: what incentives, constraints, and information asymmetries produce this behavior?

**When to use:** Phase 1 when decomposing stakeholder behavior. Phase 3 when modeling how actors will respond to scenarios. Any time the analysis says 'they should just...' — that's a signal to apply this recipe.

**Oracle phases:** Phase 1, Phase 3  
**Oracle agents:** Decomposer, Red Team

**Steps:**

**Step 1: Start with incentives, not character**
_Axioms:_ AXM-110 (Incentive Superpower (Munger)), AXM-132 (Fundamental Attribution Error)
Apply Incentive Superpower (AXM-110): what are the actors being rewarded for? What are they punished for? Then check Fundamental Attribution Error (AXM-132): are you attributing behavior to character ('they're incompetent') when incentives explain it ('they're rationally responding to what they're measured on')?

**Step 2: Map the principal-agent structure**
_Axioms:_ AXM-016 (Principal-Agent Problem), AXM-052 (Moral Hazard), AXM-010 (Goodhart's Law)
Who is the agent, who is the principal (AXM-016)? Where is the Moral Hazard (AXM-052) — who bears risk vs. who makes decisions? Has Goodhart's Law (AXM-010) decoupled their metrics from their actual goals?

**Step 3: Check organizational structure constraints**
_Axioms:_ AXM-011 (Conway's Law), AXM-001 (Brooks' Law), AXM-043 (Alignment Tax (Coordination Cost)), AXM-004 (Dunbar's Number)
Apply Conway's Law (AXM-011): does their system architecture mirror their org structure? Brooks' Law (AXM-001): are they adding people to a late project? Alignment Tax (AXM-043): how much of their effort goes to coordination? Dunbar's Number (AXM-004): have they exceeded the cognitive limit for informal coordination?

**Step 4: Look for systems archetypes**
_Axioms:_ AXM-033 (Shifting the Burden Archetype), AXM-118 (Fixes that Fail Archetype), AXM-119 (Eroding Goals Archetype), AXM-080 (Organizational Debt)
Is this a Shifting the Burden pattern (AXM-033) — symptomatic fix undermining the fundamental solution? Fixes that Fail (AXM-118) — quick fix creating delayed consequences? Eroding Goals (AXM-119) — lowering standards instead of raising performance? How much Organizational Debt (AXM-080) has accumulated?

**Step 5: Understand before prescribing**
_Axioms:_ AXM-128 (Chesterton's Fence), AXM-044 (Parkinson's Law), AXM-075 (Peter Principle)
Apply Chesterton's Fence (AXM-128): before recommending change, understand WHY things are this way. Check Parkinson's Law (AXM-044): has work expanded to fill available resources? Peter Principle (AXM-075): are people in roles that exceed their competence because of promotion-based-on-current-role?

**Techniques used:** T01 (Incentive Chain Tracing), T12 (Stakeholder Incentive Map), T08 (Binding Constraint Identification), T10 (Boundary Condition Check)

**Traps to watch for:**

- _Assuming malice or stupidity_ → Hanlon's Razor (AXM-105): structural explanations are more likely and more actionable than character explanations.
- _Projecting your own context_ → Curse of Knowledge (AXM-056): your information and constraints are different from theirs. Model from THEIR perspective.
- _Recommending change without understanding transition costs_ → Activation Energy (AXM-131): the end state may be better, but the transition barrier may be prohibitive without a catalyst.

**Output template:** Organizational behavior analysis: (1) Incentive map (what actors are optimizing for), (2) Principal-agent structure, (3) Structural constraints (org design, coordination costs), (4) Active systems archetypes, (5) Assessment: rational behavior given constraints, or genuinely dysfunctional?

---

### Recipe A3: Why hasn't this obvious improvement happened?

**Question:** When something seems like it should have already happened but hasn't, find the hidden barriers. This is the 'it seems obvious, so why not?' recipe — the most dangerous analytical trap in scenario planning.

**When to use:** Whenever analysis produces a claim like 'companies should obviously adopt X' or 'this market should have consolidated by now.' The word 'should' is the trigger — reality is the way it is for reasons.

**Oracle phases:** Phase 1, Phase 2  
**Oracle agents:** Decomposer, Verifier, Red Team

**Steps:**

**Step 1: Check for activation energy barriers**
_Axioms:_ AXM-131 (Activation Energy / Catalysts), AXM-025 (Status Quo Bias), AXM-114 (Default Effect (Parrish))
Apply Activation Energy (AXM-131): the end state may be better, but what's the transition cost? Status Quo Bias (AXM-025): people prefer the current state. Default Effect (AXM-114): the current approach has the enormous advantage of being the default. Is the improvement genuinely better enough to overcome these combined barriers?

**Step 2: Check for switching cost and lock-in**
_Axioms:_ AXM-062 (Switching Costs), AXM-036 (Path Dependence), AXM-057 (Sunk Cost Fallacy)
Switching Costs (AXM-062) may be higher than visible. Path Dependence (AXM-036) may have locked in the current approach. Sunk Cost Fallacy (AXM-057) may keep actors invested in the status quo even when they know the alternative is better.

**Step 3: Check for coordination failure**
_Axioms:_ AXM-027 (Prisoner's Dilemma), AXM-030 (Tragedy of the Commons), AXM-028 (Schelling Focal Point)
Is this a Prisoner's Dilemma (AXM-027) — individually rational to NOT adopt even though collective adoption would be better? Tragedy of the Commons (AXM-030) — shared resource problem? Is there no Schelling Focal Point (AXM-028) to coordinate around?

**Step 4: Check for previous failed attempts**
_Axioms:_ AXM-127 (Cobra Effect (Perverse Incentives)), AXM-118 (Fixes that Fail Archetype), AXM-033 (Shifting the Burden Archetype)
Cobra Effect (AXM-127): was this tried before and did it backfire? Fixes that Fail (AXM-118): did a previous attempt create consequences that made the problem worse? Shifting the Burden (AXM-033): is there a symptomatic fix already in place that reduces urgency for the fundamental improvement?

**Step 5: Assess what would need to change**
_Axioms:_ AXM-034 (Leverage Points in Systems), AXM-037 (Tipping Points / Phase Transitions), AXM-133 (Overton Window)
Use Leverage Points (AXM-034) to identify where intervention would be most effective. Check for Tipping Points (AXM-037): is there a threshold that hasn't been crossed yet? Overton Window (AXM-133): is the idea within the range of acceptability, or does the window need to shift first?

**Techniques used:** T03 (Inversion Pass), T01 (Incentive Chain Tracing), T08 (Binding Constraint Identification), T13 (Threshold Identification)

**Traps to watch for:**

- _Assuming the improvement is as obvious as it seems_ → WYSIATI (AXM-100): you're working with the information you have. The actors in the system have different information and constraints.
- _Underestimating coordination costs_ → Alignment Tax (AXM-043): even if everyone agrees, the coordination cost of collective action may exceed individual switching costs.
- _Ignoring the beneficiaries of the status quo_ → Incentive Superpower (AXM-110): someone benefits from things being the way they are. Who, and what's their power?

**Output template:** Barrier analysis: (1) Transition barriers (activation energy, switching costs, sunk costs), (2) Coordination failures, (3) Previous attempts and their consequences, (4) Required catalysts and leverage points, (5) Assessment: is this improvement genuinely blocked or just delayed?

---

### Recipe A4: What is the binding constraint?

**Question:** In any system with multiple potential bottlenecks, identify the ONE constraint that actually limits throughput. Everything else is noise until this is addressed.

**When to use:** Phase 1 when decomposing why a system underperforms. Phase 3 when assessing whether a scenario's proposed mechanism actually targets the binding constraint.

**Oracle phases:** Phase 1, Phase 3  
**Oracle agents:** Decomposer, Verifier

**Steps:**

**Step 1: Identify the constraint**
_Axioms:_ AXM-012 (Theory of Constraints (TOC)), AXM-007 (Amdahl's Law)
Apply Theory of Constraints (AXM-012): system throughput = throughput of the tightest constraint. Use Amdahl's Law (AXM-007): even with infinite scaling of non-bottleneck components, the serial bottleneck determines the ceiling. Where is the constraint?

**Step 2: Verify it's the real constraint, not a decoy**
_Axioms:_ AXM-122 (Premature Optimization), AXM-085 (Parkinson's Law of Triviality (Bikeshedding))
Check for Premature Optimization (AXM-122): is effort being directed at the wrong bottleneck? Bikeshedding (AXM-085): are people optimizing the thing they understand rather than the thing that matters?

**Step 3: Understand what happens when this constraint is relieved**
_Axioms:_ AXM-013 (Diminishing Marginal Returns), AXM-032 (Limits to Growth Archetype)
Diminishing Marginal Returns (AXM-013): relieving the constraint has decreasing returns. Limits to Growth (AXM-032): a new constraint will immediately emerge. What is the NEXT constraint? How much headroom does relieving the current one provide?

**Step 4: Check if the constraint is being managed or avoided**
_Axioms:_ AXM-033 (Shifting the Burden Archetype), AXM-120 (Growth and Underinvestment Archetype)
Shifting the Burden (AXM-033): is there a workaround that makes the constraint tolerable but prevents addressing it? Growth and Underinvestment (AXM-120): is underinvestment in removing the constraint being rationalized as market conditions?

**Techniques used:** T08 (Binding Constraint Identification), T02 (Second-Order Chain), T10 (Boundary Condition Check)

**Traps to watch for:**

- _Confusing symptoms with constraints_ → Iceberg Model (AXM-116): the visible symptom is at the event level. The constraint is at the structural or mental model level.
- _Multiple constraints masquerading as one_ → Check whether 'the constraint' is actually several interacting constraints — if so, they may need to be addressed simultaneously.

**Output template:** Constraint analysis: (1) The binding constraint and evidence it's binding, (2) Verification it's the real constraint, (3) What happens when it's relieved (next constraint), (4) How it's currently being managed or avoided.

---

## Category B: "What happens next?" — Dynamics & Trajectories

_Primary phase: Phase 2–3_

### Recipe B1: Where is this trend heading?

**Question:** Given an observed trend, assess where it sits on its trajectory, what limits it will hit, and what the plausible future states are.

**When to use:** Phase 2 trend analysis. Core recipe for every trend the Scanner identifies.

**Oracle phases:** Phase 2  
**Oracle agents:** Scanner, Impact Assessor

**Steps:**

**Step 1: Locate position on the S-curve**
_Axioms:_ AXM-045 (Innovation S-Curve), AXM-046 (Crossing the Chasm)
Apply Innovation S-Curve (AXM-045): is this trend in early exploration, rapid improvement, or approaching plateau? Crossing the Chasm (AXM-046): if it's a technology trend, has it crossed from early adopters to early majority? Or is it in the chasm?

**Step 2: Identify the carrying capacity and limits**
_Axioms:_ AXM-032 (Limits to Growth Archetype), AXM-013 (Diminishing Marginal Returns), AXM-012 (Theory of Constraints (TOC))
Limits to Growth (AXM-032): what's the ceiling? What constraint will slow this trend? Diminishing Returns (AXM-013): where do additional inputs stop producing proportional outputs? Theory of Constraints (AXM-012): what bottleneck will this hit?

**Step 3: Trace second-order effects**
_Axioms:_ AXM-095 (Second-Order Thinking), AXM-031 (Feedback Loops (Reinforcing/Balancing)), AXM-047 (Jevons Paradox (Rebound Effect))
MANDATORY Second-Order Thinking (AXM-095): trace at least 3 steps forward. Map Feedback Loops (AXM-031): is this trend self-reinforcing or self-limiting? Check for Jevons Paradox (AXM-047): could efficiency gains increase rather than decrease consumption?

**Step 4: Calibrate the timeline**
_Axioms:_ AXM-076 (Amara's Law), AXM-055 (Planning Fallacy), AXM-124 (Reference Class Forecasting)
Apply Amara's Law (AXM-076): are you overestimating near-term impact and underestimating long-term impact? Planning Fallacy (AXM-055): are timelines anchored optimistically? Reference Class Forecasting (AXM-124): what happened with analogous past trends?

**Step 5: Assess vulnerability to disruption**
_Axioms:_ AXM-039 (Christensen's Disruption Theory), AXM-059 (Creative Destruction (Schumpeter)), AXM-037 (Tipping Points / Phase Transitions)
Disruption Theory (AXM-039): could this trend be disrupted by a simpler, cheaper alternative serving overlooked segments? Creative Destruction (AXM-059): what existing value will this trend destroy? Tipping Points (AXM-037): are there thresholds where the trend's dynamics shift qualitatively?

**Techniques used:** T02 (Second-Order Chain), T04 (Causal Loop Diagramming), T05 (Outside View First), T15 (Temporal Decomposition)

**Traps to watch for:**

- _Linear extrapolation of exponential change_ → S-curves are sigmoidal, not linear. Early exponential growth does not continue — but the plateau may be far higher than current levels.
- _Anchoring on the present_ → Anchoring Effect (AXM-024): your mental model of 'normal' is anchored on the last few years. This may be a poor guide to the next decade.
- _Ignoring induced demand_ → Induced Demand (AXM-048): when something gets cheaper, entirely new use cases emerge. Don't just model existing use cases at lower cost.

**Output template:** Trend trajectory: (1) Current position on S-curve, (2) Carrying capacity and limiting constraints, (3) Second-order effects (3+ step causal chain), (4) Calibrated timeline with reference class, (5) Disruption vulnerability, (6) Key thresholds and tipping points.

---

### Recipe B2: What happens when this gets cheaper/faster/easier?

**Question:** When a capability becomes dramatically cheaper (typically via AI or technology), trace the economic and behavioral consequences. This is the core AI impact recipe.

**When to use:** Phase 2–3 when analyzing the impact of cost reduction, automation, or AI-driven efficiency gains on an industry or capability.

**Oracle phases:** Phase 2, Phase 3  
**Oracle agents:** Scanner, Scenario Developer, Equilibrium Analyst

**Steps:**

**Step 1: Apply Jevons and induced demand**
_Axioms:_ AXM-047 (Jevons Paradox (Rebound Effect)), AXM-048 (Induced Demand)
Jevons Paradox (AXM-047): when X gets cheaper, demand for X may INCREASE not decrease. If coding becomes 10x faster, the result may be 20x more code written, not 10x fewer programmers. Induced Demand (AXM-048): entirely new use cases emerge that were previously infeasible. What becomes newly possible?

**Step 2: Identify the newly scarce complement**
_Axioms:_ AXM-060 (Complementary Goods Dynamics), AXM-021 (Attention as Scarce Resource (Simon's Attention Economics))
Complementary Goods (AXM-060): when X becomes cheap, what is X's complement? That complement's value increases. Attention Economics (AXM-021): if production becomes cheap, curation/selection becomes the scarce resource. What was previously bundled with X that now gets unbundled and repriced?

**Step 3: Trace the value chain restructuring**
_Axioms:_ AXM-064 (Wardley Mapping (Value Chain Evolution)), AXM-003 (Coase's Theory of the Firm), AXM-040 (Modularity Theory)
Wardley Evolution (AXM-064): the component that got cheap moves rightward on the evolution axis. What does this do to adjacent components? Coase's Theory (AXM-003): does the cost change shift the make-vs-buy boundary? Modularity Theory (AXM-040): does cheaper X enable more modular architectures?

**Step 4: Model the competitive dynamics**
_Axioms:_ AXM-068 (Wright's Law (Learning Curve / Experience Curve)), AXM-059 (Creative Destruction (Schumpeter)), AXM-049 (Winner-Take-All / Winner-Take-Most Markets)
Wright's Law (AXM-068): cost reduction compounds — the first mover on the learning curve has a lasting advantage. Creative Destruction (AXM-059): whose existing value is destroyed? Winner-Take-All (AXM-049): does the cost reduction amplify scale advantages?

**Step 5: Apply second-order discipline**
_Axioms:_ AXM-095 (Second-Order Thinking), AXM-031 (Feedback Loops (Reinforcing/Balancing)), AXM-091 (Reflexivity (Soros))
Second-Order Thinking (AXM-095): 1st effect (cost drops) → 2nd effect (new actors enter) → 3rd effect (incumbents respond) → 4th effect (market restructures). Feedback Loops (AXM-031): are the effects self-reinforcing? Reflexivity (AXM-091): do expectations about the cost reduction change the rate at which it happens?

**Techniques used:** T02 (Second-Order Chain), T01 (Incentive Chain Tracing), T04 (Causal Loop Diagramming), T13 (Threshold Identification)

**Traps to watch for:**

- _Asking 'who loses their job?' instead of 'what becomes newly possible?'_ → The first-order job displacement question is less predictive than the induced demand question. Focus on new possibility, not old replacement.
- _Assuming current task decomposition persists_ → When X gets 10x cheaper, jobs don't just have less X — jobs get redesigned around the assumption that X is abundant. The task boundaries shift.
- _Ignoring Gresham's Law_ → AXM-088: if AI-generated output floods a channel, quality standards may drop as bad drives out good. Build in quality mechanism analysis.

**Output template:** Cost reduction impact: (1) Jevons/induced demand effects, (2) Newly scarce complements, (3) Value chain restructuring, (4) Competitive dynamics, (5) Second-order causal chain (≥4 steps), (6) Timeline with Wright's Law cost curve.

---

### Recipe B3: How will actors respond to this change?

**Question:** Model how rational actors (competitors, regulators, customers, employees) will respond to a change, including their responses to each other's responses.

**When to use:** Phase 3 scenario development. Whenever a scenario involves a change that actors will respond to — which is virtually all scenarios.

**Oracle phases:** Phase 3  
**Oracle agents:** Scenario Developer, Equilibrium Analyst

**Steps:**

**Step 1: Map each actor's incentive structure**
_Axioms:_ AXM-110 (Incentive Superpower (Munger)), AXM-016 (Principal-Agent Problem), AXM-125 (Skin in the Game (Taleb))
For each major actor: Incentive Superpower (AXM-110) — what are they optimizing? Principal-Agent (AXM-016) — who decides vs. who bears consequences? Skin in the Game (AXM-125) — who has symmetric vs. asymmetric exposure to outcomes?

**Step 2: Model strategic interaction**
_Axioms:_ AXM-026 (Nash Equilibrium), AXM-027 (Prisoner's Dilemma), AXM-089 (Keynesian Beauty Contest)
Nash Equilibrium (AXM-026): what's the stable outcome where no actor benefits from unilateral change? Prisoner's Dilemma (AXM-027): are actors trapped in a suboptimal equilibrium? Keynesian Beauty Contest (AXM-089): are actors optimizing for what they think others will do rather than what's objectively best?

**Step 3: Assess response speed and constraints**
_Axioms:_ AXM-025 (Status Quo Bias), AXM-062 (Switching Costs), AXM-131 (Activation Energy / Catalysts)
Status Quo Bias (AXM-025): how strong is inertia? Switching Costs (AXM-062): what does changing course cost each actor? Activation Energy (AXM-131): what's the transition barrier even for actors who want to change?

**Step 4: Trace the response chain**
_Axioms:_ AXM-095 (Second-Order Thinking), AXM-091 (Reflexivity (Soros)), AXM-031 (Feedback Loops (Reinforcing/Balancing))
Second-Order Thinking (AXM-095): Actor A responds → Actor B adjusts → Actor A re-adjusts. Trace at least 3 rounds. Reflexivity (AXM-091): do expectations change the reality? Feedback Loops (AXM-031): does the response chain converge to a new equilibrium or diverge into instability?

**Techniques used:** T01 (Incentive Chain Tracing), T12 (Stakeholder Incentive Map), T02 (Second-Order Chain), T04 (Causal Loop Diagramming)

**Traps to watch for:**

- _Modeling actors as rational optimizers with full information_ → Bounded Rationality (AXM-022): actors satisfice, they don't optimize. They have limited information and cognitive capacity.
- _Fundamental Attribution Error in competitor modeling_ → AXM-132: model competitors as rational agents responding to their constraints, not as geniuses or fools.
- _Ignoring the Overton Window_ → AXM-133: some responses are not taken because they're outside the range of acceptable options, not because no one thought of them.

**Output template:** Actor response analysis: (1) Incentive map per actor, (2) Strategic interaction dynamics, (3) Response speed and constraints per actor, (4) Multi-round response chain (≥3 rounds), (5) Likely new equilibrium or divergence assessment.

---

### Recipe B4: Will this adoption succeed or stall?

**Question:** Given a new technology, practice, or standard, assess whether it will achieve broad adoption or get stuck.

**When to use:** Phase 2 trend assessment. Phase 3 when a scenario hinges on adoption of a specific technology or practice.

**Oracle phases:** Phase 2, Phase 3  
**Oracle agents:** Scanner, Impact Assessor, Scenario Developer

**Steps:**

**Step 1: Position on the adoption curve**
_Axioms:_ AXM-046 (Crossing the Chasm), AXM-045 (Innovation S-Curve)
Crossing the Chasm (AXM-046): which segment is currently adopting? Is this pre-chasm (early adopters) or post-chasm (early majority)? S-Curve (AXM-045): is the technology still in exploration or has it reached the rapid-improvement phase?

**Step 2: Assess the switching economics**
_Axioms:_ AXM-062 (Switching Costs), AXM-025 (Status Quo Bias), AXM-114 (Default Effect (Parrish)), AXM-131 (Activation Energy / Catalysts)
What's the total Switching Cost (AXM-062) — financial + learning + data + relationship + psychological? Status Quo Bias (AXM-025) + Default Effect (AXM-114): how strong is inertia? What Activation Energy (AXM-131) is required? Is there a catalyst?

**Step 3: Check for network effects and critical mass**
_Axioms:_ AXM-038 (Network Effects (Direct and Indirect)), AXM-028 (Schelling Focal Point), AXM-117 (Success to the Successful Archetype)
Network Effects (AXM-038): does adoption by others increase value for each user? If so, is there a critical mass threshold? Schelling Focal Point (AXM-028): is there a natural coordination point? Success to Successful (AXM-117): will early adopters accumulate advantages that accelerate adoption?

**Step 4: Look for the whole product**
_Axioms:_ AXM-020 (Cognitive Load Theory), AXM-065 (Hick's Law (Choice Overload)), AXM-040 (Modularity Theory)
Cognitive Load (AXM-020): does adoption require learning that exceeds users' capacity? Hick's Law (AXM-065): are there too many options confusing potential adopters? Modularity (AXM-040): can users adopt incrementally or must they switch everything at once?

**Step 5: Calibrate with reference class**
_Axioms:_ AXM-124 (Reference Class Forecasting), AXM-076 (Amara's Law), AXM-071 (Lindy Effect)
Reference Class Forecasting (AXM-124): what happened with analogous past adoptions? Amara's Law (AXM-076): are expectations calibrated to the hype cycle? Lindy Effect (AXM-071): how durable is what this is replacing?

**Techniques used:** T05 (Outside View First), T13 (Threshold Identification), T02 (Second-Order Chain), T10 (Boundary Condition Check)

**Traps to watch for:**

- _Technology determinism — assuming better tech always wins_ → Switching costs, network effects, and defaults can keep inferior technology in place for decades (QWERTY, VHS, etc.).
- _Survivorship Bias in adoption precedents_ → AXM-054: you're studying successful adoptions. For every technology that crossed the chasm, many didn't. What's the base rate?
- _Confusing enthusiasm with adoption_ → Early adopter enthusiasm is not a reliable signal of mainstream adoption. The chasm separates the two.

**Output template:** Adoption assessment: (1) Adoption curve position, (2) Switching economics, (3) Network effects and critical mass status, (4) Whole product readiness, (5) Reference class calibration, (6) Verdict: likely adoption path and timeline.

---

### Recipe B5: What feedback loops are at play?

**Question:** Map the reinforcing and balancing feedback loops in a system, identify which loop currently dominates, and find the conditions under which dominance shifts.

**When to use:** Phase 1 (Systems Mapper) and Phase 3 (Equilibrium Analyst). The core systems thinking recipe.

**Oracle phases:** Phase 1, Phase 3  
**Oracle agents:** Systems Mapper, Equilibrium Analyst

**Steps:**

**Step 1: Identify all major loops**
_Axioms:_ AXM-031 (Feedback Loops (Reinforcing/Balancing)), AXM-117 (Success to the Successful Archetype), AXM-032 (Limits to Growth Archetype)
Map Reinforcing and Balancing Loops (AXM-031). Check for Success to Successful archetype (AXM-117) — self-reinforcing advantage accumulation. Check for Limits to Growth (AXM-032) — reinforcing loop hitting a balancing constraint.

**Step 2: Determine current loop dominance**
_Axioms:_ AXM-037 (Tipping Points / Phase Transitions), AXM-084 (Regression Discontinuity / Threshold Effects)
Which loop currently drives system behavior? Where are the Tipping Points (AXM-037) where dominance shifts? Are there Threshold Effects (AXM-084) that would trigger a different loop to take over?

**Step 3: Check for delays and oscillation**
_Axioms:_ AXM-074 (Bathtub Theorem (Stock and Flow)), AXM-072 (Little's Law)
Bathtub Theorem (AXM-074): stocks accumulate slowly even when flows change rapidly — what's the delay between action and visible effect? Little's Law (AXM-072): how does system capacity relate to throughput and cycle time? Delays in feedback create oscillation and overshoot.

**Step 4: Identify leverage points**
_Axioms:_ AXM-034 (Leverage Points in Systems), AXM-073 (Law of Requisite Variety (Ashby's Law))
Leverage Points (AXM-034): where in this loop structure would a small change produce a big effect? Ashby's Law (AXM-073): does the controller have sufficient variety to manage these dynamics?

**Step 5: Assess for reflexivity and observer effects**
_Axioms:_ AXM-091 (Reflexivity (Soros)), AXM-136 (Observer Effect / Heisenberg (Social))
Reflexivity (AXM-091): do actors' beliefs about the loops change the loops themselves? Observer Effect (AXM-136): does measurement or analysis of the system alter its behavior?

**Techniques used:** T04 (Causal Loop Diagramming), T13 (Threshold Identification), T02 (Second-Order Chain), T08 (Binding Constraint Identification)

**Traps to watch for:**

- _Mapping too many loops (analysis paralysis)_ → Identify the 3-5 DOMINANT loops. The rest are noise at this level of analysis. Use Pareto (AXM-006): 20% of loops drive 80% of behavior.
- _Ignoring delays_ → Most systems thinking errors come from ignoring delays. A feedback loop with a 3-year delay looks like no feedback at all in the short term.
- _Assuming loop structure is fixed_ → Niche Construction (AXM-139): actors actively modify the loop structure. The loops you map today may not be the same loops operating in the future scenario.

**Output template:** Feedback loop analysis: (1) Loop map (reinforcing and balancing), (2) Current dominant loop, (3) Delay structure, (4) Tipping points where dominance shifts, (5) Leverage points, (6) Reflexivity assessment.

---

## Category C: "What could go wrong?" — Risk & Failure Modes

_Primary phase: Phase 3 (Red Team)_

### Recipe C1: What would make this scenario impossible?

**Question:** The Inversion recipe. Instead of arguing FOR the scenario, systematically identify conditions that would guarantee its failure. Then check whether those conditions hold.

**When to use:** Phase 3 Red Team evaluation. MANDATORY for every scenario before it passes Gate C.

**Oracle phases:** Phase 3  
**Oracle agents:** Red Team

**Steps:**

**Step 1: Apply inversion**
_Axioms:_ AXM-093 (Inversion (Munger))
Inversion (AXM-093): list 3-5 conditions that would GUARANTEE this scenario fails or is impossible. Be specific — not 'things don't change' but 'X specific mechanism is blocked because Y specific constraint exists.'

**Step 2: Check each failure condition against reality**
_Axioms:_ AXM-129 (Falsifiability (Popper)), AXM-083 (Bayes' Theorem (Belief Updating))
For each failure condition: Falsifiability (AXM-129) — is this testable? Can we look at evidence? Bayes' Theorem (AXM-083) — given current evidence, what's the probability this failure condition holds? Be honest about uncertainty.

**Step 3: Check for hidden assumptions**
_Axioms:_ AXM-100 (WYSIATI — What You See Is All There Is (Kahneman)), AXM-023 (Confirmation Bias), AXM-054 (Survivorship Bias)
WYSIATI (AXM-100): what information is the scenario built on that might be incomplete? Confirmation Bias (AXM-023): has the scenario been constructed from evidence that supports it while ignoring disconfirming evidence? Survivorship Bias (AXM-054): is the scenario modeled on a success case while ignoring similar cases that failed?

**Step 4: Test logical and causal coherence**
_Axioms:_ AXM-104 (Occam's Razor), AXM-103 (Narrative Fallacy (Taleb/Kahneman))
Occam's Razor (AXM-104): does this scenario require more assumptions than necessary? Can a simpler mechanism produce the same outcome? Narrative Fallacy (AXM-103): is the scenario compelling because it tells a good story, or because the causal logic is sound? Separate the two.

**Step 5: Issue verdict**
_Axioms:_ AXM-094 (Map vs. Territory (Korzybski))
Map vs. Territory (AXM-094): state explicitly — this scenario is a model, not a prediction. List: (a) conditions that would invalidate it, (b) the earliest observable signals of invalidation, (c) confidence assessment. The scenario passes Red Team if no failure condition has P > 0.7.

**Techniques used:** T03 (Inversion Pass), T06 (Evidence Audit), T10 (Boundary Condition Check), T05 (Outside View First)

**Traps to watch for:**

- _Weak inversion (failure conditions too vague to test)_ → Each failure condition must be specific enough to have a testable indicator.
- _Attacking the narrative instead of the mechanism_ → Focus on causal logic, not storytelling quality. An ugly scenario with strong causal logic beats a beautiful scenario with weak foundations.
- _Over-applying Red Team (killing every scenario)_ → The goal is not to prove scenarios wrong — it's to test their structural integrity. Genuine uncertainty is healthy.

**Output template:** Inversion analysis: (1) 3-5 specific failure conditions, (2) Evidence assessment per condition, (3) Hidden assumption audit, (4) Causal coherence test, (5) Verdict: structurally sound / needs revision / fatally flawed.

---

### Recipe C2: Is this extreme outcome plausible?

**Question:** When a scenario involves an extreme or transformative outcome, assess whether the conditions for such an outcome actually exist. The Lollapalooza recipe.

**When to use:** Phase 3 when scoring scenarios for plausibility, especially for high-impact scenarios that seem either too dramatic or not dramatic enough.

**Oracle phases:** Phase 3  
**Oracle agents:** Red Team, Consistency Checker

**Steps:**

**Step 1: Run the Lollapalooza scan**
_Axioms:_ AXM-097 (Lollapalooza Effect (Munger))
Lollapalooza Effect (AXM-097): count the number of independent reinforcing forces in the scenario pointing in the same direction. If ≥3 with no identified balancing force: tag as lollapalooza candidate. The extreme outcome is MORE plausible than linear analysis suggests.

**Step 2: Check the distribution type**
_Axioms:_ AXM-069 (Power Law Distribution (Fat Tails)), AXM-082 (Law of Large Numbers (Statistical Convergence))
Power Law Distribution (AXM-069): is the underlying phenomenon fat-tailed? If so, extreme events are far more likely than normal distribution assumes. Law of Large Numbers (AXM-082): is the sample size large enough to have seen tail events? If the phenomenon is fat-tailed, standard risk assessment is too conservative.

**Step 3: Look for tipping point conditions**
_Axioms:_ AXM-037 (Tipping Points / Phase Transitions), AXM-084 (Regression Discontinuity / Threshold Effects), AXM-031 (Feedback Loops (Reinforcing/Balancing))
Tipping Points (AXM-037): are the preconditions for a phase transition accumulating? Threshold Effects (AXM-084): is there a discontinuity point? Feedback Loops (AXM-031): are reinforcing loops approaching the point where they dominate all balancing loops?

**Step 4: Historical precedent check**
_Axioms:_ AXM-124 (Reference Class Forecasting), AXM-101 (Base Rate Neglect (Kahneman/Tversky)), AXM-102 (Availability Heuristic (Kahneman/Tversky))
Reference Class Forecasting (AXM-124): has this TYPE of extreme outcome occurred before in analogous situations? What was the base rate? Base Rate Neglect (AXM-101): is the vivid scenario narrative causing you to overweight this specific case vs. the statistical base rate? Availability Heuristic (AXM-102): is this extreme outcome top-of-mind because of recent similar events?

**Step 5: Assess non-ergodicity**
_Axioms:_ AXM-087 (Ergodicity (Non-Ergodic Systems)), AXM-137 (Seneca's Asymmetry (Downside Dominance))
Ergodicity (AXM-087): even if this outcome is unlikely ON AVERAGE, is it the kind of event that could be catastrophic for a specific organization? Seneca's Asymmetry (AXM-137): is the downside disproportionately worse than the upside is good? If so, the scenario deserves weight beyond its probability.

**Techniques used:** T07 (Lollapalooza Scan), T05 (Outside View First), T13 (Threshold Identification), T06 (Evidence Audit)

**Traps to watch for:**

- _Dismissing extreme outcomes because they're improbable_ → In fat-tailed distributions, improbable outcomes account for most of the expected impact. Probability × Impact is what matters, not probability alone.
- _Accepting extreme outcomes because the story is compelling_ → Narrative Fallacy (AXM-103): separate narrative quality from structural plausibility. Does the mechanism actually support this outcome?
- _Anchoring on recent extreme events_ → Availability Heuristic (AXM-102): recent pandemics, market crashes, or AI breakthroughs anchor our sense of what's extreme. Check the longer historical record.

**Output template:** Extreme outcome assessment: (1) Lollapalooza scan result, (2) Distribution type (normal vs. fat-tailed), (3) Tipping point proximity, (4) Historical precedent and base rate, (5) Non-ergodicity/asymmetry assessment, (6) Verdict: plausible extreme / implausible without lollapalooza / genuine black swan territory.

---

### Recipe C3: What are we not seeing?

**Question:** Systematically identify blind spots in the analysis. What evidence is missing, what domains haven't been considered, and what assumptions are invisible?

**When to use:** Phase 3 Red Team evaluation. Also valuable at Phase 1 gate and Phase 2 gate as a completeness check.

**Oracle phases:** Phase 1, Phase 2, Phase 3  
**Oracle agents:** Red Team, Weak Signal Hunter

**Steps:**

**Step 1: Run the WYSIATI check**
_Axioms:_ AXM-100 (WYSIATI — What You See Is All There Is (Kahneman)), AXM-102 (Availability Heuristic (Kahneman/Tversky)), AXM-023 (Confirmation Bias)
WYSIATI (AXM-100): what information was used to construct this analysis? What information was NOT sought? Availability Heuristic (AXM-102): is the evidence skewed toward recent, vivid, or personally experienced events? Confirmation Bias (AXM-023): was disconfirming evidence actively sought?

**Step 2: Check domain coverage**
_Axioms:_ AXM-109 (Multi-Disciplinary Lattice (Munger)), AXM-096 (Circle of Competence (Munger/Buffett))
Multi-Disciplinary Lattice (AXM-109): which domains have been applied? Which have NOT? (STEEP+V: Social, Technological, Economic, Environmental, Political, Values). Circle of Competence (AXM-096): where are the model's and analysts' blind spots?

**Step 3: Look for invisible assumptions**
_Axioms:_ AXM-024 (Anchoring Effect), AXM-121 (Hindsight Bias (Kahneman)), AXM-123 (First Conclusion Bias)
Anchoring Effect (AXM-024): what anchors are embedded in the analysis? Hindsight Bias (AXM-121): are we treating current conditions as more inevitable than they actually were? First Conclusion Bias (AXM-123): was the first plausible explanation accepted without exploring alternatives?

**Step 4: Seek anti-available evidence**
_Axioms:_ AXM-054 (Survivorship Bias), AXM-053 (Regression to the Mean)
Survivorship Bias (AXM-054): what failures and non-events are we not seeing? Regression to the Mean (AXM-053): are we attributing trends to causes when they may simply be noise reverting?

**Step 5: Check for observer effects**
_Axioms:_ AXM-136 (Observer Effect / Heisenberg (Social)), AXM-091 (Reflexivity (Soros))
Observer Effect (AXM-136): does our analysis itself change the system? Reflexivity (AXM-091): will publishing these scenarios change which scenario materializes?

**Techniques used:** T09 (Anti-Availability Search), T06 (Evidence Audit), T10 (Boundary Condition Check), T11 (Integrative Synthesis)

**Traps to watch for:**

- _Treating 'we looked and found nothing' as 'nothing is there'_ → Absence of evidence ≠ evidence of absence. Not finding disconfirming evidence may mean it wasn't available, not that it doesn't exist.
- _Analysis paralysis from too many blind spots_ → Prioritize: which blind spots, if filled, would most change the analysis? Focus there.

**Output template:** Blind spot audit: (1) WYSIATI inventory (information used vs. not sought), (2) Domain coverage gaps, (3) Invisible assumptions, (4) Anti-available evidence, (5) Observer effects, (6) Priority blind spots to address.

---

### Recipe C4: Will this intervention backfire?

**Question:** For any proposed response to a scenario (policy, strategy, investment), check whether it will produce unintended consequences that worsen the original problem.

**When to use:** Phase 3 backcasting when evaluating strategic recommendations. Also during Red Team evaluation of scenario responses.

**Oracle phases:** Phase 3  
**Oracle agents:** Red Team, Equilibrium Analyst

**Steps:**

**Step 1: Check for perverse incentives**
_Axioms:_ AXM-127 (Cobra Effect (Perverse Incentives)), AXM-010 (Goodhart's Law)
Cobra Effect (AXM-127): does this intervention create incentives to produce MORE of the problem? Goodhart's Law (AXM-010): if you're targeting a metric, will the metric decouple from the underlying goal?

**Step 2: Check for systems archetypes**
_Axioms:_ AXM-118 (Fixes that Fail Archetype), AXM-033 (Shifting the Burden Archetype), AXM-119 (Eroding Goals Archetype)
Fixes that Fail (AXM-118): does the intervention have delayed consequences that worsen the original problem? Shifting the Burden (AXM-033): does the intervention address symptoms and reduce urgency for the fundamental solution? Eroding Goals (AXM-119): does it implicitly lower standards?

**Step 3: Trace second-order effects**
_Axioms:_ AXM-095 (Second-Order Thinking), AXM-031 (Feedback Loops (Reinforcing/Balancing))
Second-Order Thinking (AXM-095): the intervention has a first-order effect (intended). What's the second-order effect (response to the intervention)? Third-order (response to the response)? Feedback Loops (AXM-031): does the intervention create new reinforcing or balancing loops?

**Step 4: Check actor responses**
_Axioms:_ AXM-110 (Incentive Superpower (Munger)), AXM-026 (Nash Equilibrium), AXM-052 (Moral Hazard)
Incentive Superpower (AXM-110): how will each affected actor respond to the intervention based on their incentives? Nash Equilibrium (AXM-026): what's the new equilibrium after actors respond? Moral Hazard (AXM-052): does the intervention insulate anyone from consequences?

**Step 5: Apply Chesterton's Fence**
_Axioms:_ AXM-128 (Chesterton's Fence), AXM-077 (Second-System Effect)
Chesterton's Fence (AXM-128): does the intervention remove or change something without understanding why it exists? Second-System Effect (AXM-077): is this an over-engineered response based on lessons from a previous failure?

**Techniques used:** T01 (Incentive Chain Tracing), T02 (Second-Order Chain), T03 (Inversion Pass), T04 (Causal Loop Diagramming)

**Traps to watch for:**

- _Assuming good intentions prevent bad outcomes_ → Systems don't care about intentions. The structure of the intervention determines its effects, not the motivation behind it.
- _Ignoring time delays_ → Many interventions look effective in the short term and backfire after a delay. Explicitly ask: 'what happens in 2 years, not just 2 months?'
- _Treating the intervention as isolated from the system_ → The intervention becomes part of the system. Model it as such.

**Output template:** Backfire analysis: (1) Perverse incentive check, (2) Systems archetype match, (3) Second-order effect chain, (4) Actor response prediction, (5) Chesterton's Fence check, (6) Verdict: low/medium/high backfire risk + recommended modifications.

---

## Category D: "How confident should we be?" — Calibration & Epistemic Quality

_Primary phase: All phases (Gates)_

### Recipe D1: Is this estimate anchored or calibrated?

**Question:** For any quantitative claim or timeline estimate, check whether it's an informed estimate or an anchored guess. Apply calibration corrections.

**When to use:** All phases, at every gate. Any time a number appears in the analysis — timeline, market size, adoption rate, probability.

**Oracle phases:** Phase 1, Phase 2, Phase 3  
**Oracle agents:** Verifier, Rubric Evaluator

**Steps:**

**Step 1: Identify the anchor**
_Axioms:_ AXM-024 (Anchoring Effect), AXM-055 (Planning Fallacy)
Anchoring Effect (AXM-024): every estimate has an anchor. What is it? Is it the most recent data point? A round number? A cited source? Planning Fallacy (AXM-055): if it's a timeline, add 50-200% based on project type.

**Step 2: Apply outside view**
_Axioms:_ AXM-124 (Reference Class Forecasting), AXM-101 (Base Rate Neglect (Kahneman/Tversky))
Reference Class Forecasting (AXM-124): find the reference class of similar estimates. What's the base rate of outcomes in that class? Base Rate Neglect (AXM-101): is the specific narrative overriding statistical reality?

**Step 3: Widen the confidence interval**
_Axioms:_ AXM-111 (Probabilistic Thinking), AXM-141 (Superforecasting Principles (Tetlock)), AXM-067 (Dunning-Kruger Effect)
Probabilistic Thinking (AXM-111): express as a range, not a point estimate. Superforecasting calibration (AXM-141): confidence intervals are almost always too narrow. Widen them. Dunning-Kruger (AXM-067): the less expertise in this domain, the wider the interval should be.

**Step 4: Check for fat tails**
_Axioms:_ AXM-069 (Power Law Distribution (Fat Tails)), AXM-087 (Ergodicity (Non-Ergodic Systems))
Power Law Distribution (AXM-069): if the phenomenon is fat-tailed, the mean is misleading and the variance may be infinite. Ergodicity (AXM-087): is the average outcome meaningful for a single entity's experience?

**Techniques used:** T05 (Outside View First), T06 (Evidence Audit), T10 (Boundary Condition Check)

**Traps to watch for:**

- _Adjusting from the anchor instead of starting from the reference class_ → Start with the base rate, THEN adjust for specifics — not the reverse. The base rate should dominate.
- _False precision_ → A precise number (42.7%) implies more knowledge than a range (35-55%). Use the precision level that matches your actual knowledge.

**Output template:** Calibration check: (1) Anchor identified, (2) Reference class and base rate, (3) Calibrated estimate with confidence interval, (4) Distribution type assessment.

---

### Recipe D2: Are we confusing good story with good evidence?

**Question:** Separate narrative quality (how compelling the scenario reads) from structural quality (how well the causal logic holds up). The most dangerous scenarios are the ones that feel right but aren't.

**When to use:** Phase 3 gate evaluation. Every scenario passes through this check.

**Oracle phases:** Phase 3  
**Oracle agents:** Verifier, Red Team

**Steps:**

**Step 1: Separate narrative from structure**
_Axioms:_ AXM-103 (Narrative Fallacy (Taleb/Kahneman)), AXM-100 (WYSIATI — What You See Is All There Is (Kahneman))
Narrative Fallacy (AXM-103): is the scenario compelling because the STORY is good or because the CAUSAL LOGIC is sound? WYSIATI (AXM-100): does the narrative create a feeling of completeness despite thin evidence?

**Step 2: Audit the evidence chain**
_Axioms:_ AXM-083 (Bayes' Theorem (Belief Updating)), AXM-082 (Law of Large Numbers (Statistical Convergence))
For each major claim: Bayes' Theorem (AXM-083) — what's the prior? What evidence updates it? By how much? Law of Large Numbers (AXM-082) — is the evidence based on sufficient sample size? Technique: Evidence Audit (T06).

**Step 3: Check for storytelling biases**
_Axioms:_ AXM-121 (Hindsight Bias (Kahneman)), AXM-098 (Resulting (Annie Duke))
Hindsight Bias (AXM-121): does the scenario narrative make the outcome seem inevitable? Resulting (AXM-098): are we evaluating the scenario on its reasoning quality or on whether it matches what we expect to happen?

**Step 4: Assess independent of narrative**
_Axioms:_ AXM-129 (Falsifiability (Popper)), AXM-104 (Occam's Razor)
Falsifiability (AXM-129): does the scenario make predictions that could be disproved? If not, it's not useful. Occam's Razor (AXM-104): does the scenario use the minimum necessary assumptions?

**Techniques used:** T06 (Evidence Audit), T03 (Inversion Pass), T10 (Boundary Condition Check)

**Traps to watch for:**

- _Killing scenarios because they sound dramatic_ → Dramatic narratives can have strong structural foundations. Judge the mechanism, not the tone.
- _Accepting bland scenarios because they sound reasonable_ → A scenario that says 'things continue roughly as they are' can be the LEAST plausible if structural forces are shifting.

**Output template:** Narrative vs. structure audit: (1) Narrative quality score, (2) Structural quality score, (3) Gap assessment, (4) Evidence chain audit results, (5) Falsifiability of key predictions.

---

### Recipe D3: Is this consensus real or manufactured?

**Question:** When models or evaluators agree, check whether the agreement reflects genuine convergence on strong evidence or groupthink / common training bias.

**When to use:** Expert Council evaluation. Any time convergence exceeds expectations.

**Oracle phases:** Phase 1, Phase 2, Phase 3  
**Oracle agents:** Expert Council synthesis

**Steps:**

**Step 1: Check the independence of agreement**
_Axioms:_ AXM-023 (Confirmation Bias), AXM-099 (System 1 / System 2 Thinking (Kahneman))
Confirmation Bias (AXM-023): did each model see the others' outputs before forming its view? (In Oracle, Round 1 is blind — but check). System 1/System 2 (AXM-099): are models pattern-matching to an obvious answer rather than reasoning deeply?

**Step 2: Look for groupthink signals**
_Axioms:_ AXM-078 (Arrow's Impossibility Theorem), AXM-085 (Parkinson's Law of Triviality (Bikeshedding))
Arrow's Impossibility (AXM-078): with 3+ options, aggregate agreement may be an artifact of the voting mechanism. Bikeshedding (AXM-085): are models agreeing on the easy parts and diverging on the hard parts?

**Step 3: Assess whether dissent was possible**
_Axioms:_ AXM-133 (Overton Window), AXM-028 (Schelling Focal Point)
Overton Window (AXM-133): is the 'consensus' position simply the only one within the currently acceptable range? Schelling Focal Point (AXM-028): did all models converge on a salient, obvious answer because it was prominent, not because it was best?

**Step 4: Apply Integrative Thinking if split**
_Axioms:_ AXM-106 (Integrative Thinking (Roger Martin))
If consensus IS lacking (which is the healthy signal for complex questions): Integrative Thinking (AXM-106) — don't just record the disagreement. Construct a model that resolves the tension by asking 'what would have to be true for both to be partially right?'

**Techniques used:** T11 (Integrative Synthesis), T06 (Evidence Audit), T09 (Anti-Availability Search)

**Traps to watch for:**

- _Treating high agreement as evidence of truth_ → Four models trained on similar data may converge on the same wrong answer. Agreement is evidence of consistency, not necessarily truth.
- _Treating all disagreement as noise_ → Persistent dissent may be the most valuable signal in the analysis. The dissenting model may have seen something the others missed.

**Output template:** Consensus audit: (1) Independence of agreement, (2) Groupthink signals, (3) Was dissent structurally possible?, (4) If split: integrative synthesis result, (5) Confidence in consensus.

---

### Recipe D4: What's the right confidence level for this type of claim?

**Question:** Different types of claims warrant different confidence levels. Match confidence to claim type rather than letting narrative coherence set confidence.

**When to use:** All phases. Applied to every confidence-scored item in the Reasoning Ledger.

**Oracle phases:** Phase 1, Phase 2, Phase 3  
**Oracle agents:** Verifier, Rubric Evaluator

**Steps:**

**Step 1: Classify the claim type**
_Axioms:_ AXM-141 (Superforecasting Principles (Tetlock))
Superforecasting calibration (AXM-141): Match claim type to expected confidence range. Empirical facts: 0.8-0.95. Structural mechanisms: 0.6-0.8. Trend extrapolations: 0.4-0.7. Behavioral predictions: 0.3-0.6. Timing predictions: 0.2-0.5. Novel/unprecedented claims: 0.15-0.4.

**Step 2: Check for overconfidence signals**
_Axioms:_ AXM-067 (Dunning-Kruger Effect), AXM-100 (WYSIATI — What You See Is All There Is (Kahneman)), AXM-111 (Probabilistic Thinking)
Dunning-Kruger (AXM-067): is the analysis in a domain where model competence is well-established? WYSIATI (AXM-100): is confidence inflated by narrative coherence rather than evidence coverage? Probabilistic Thinking (AXM-111): has the estimate been stress-tested with specific counter-evidence?

**Step 3: Apply ergodicity check**
_Axioms:_ AXM-087 (Ergodicity (Non-Ergodic Systems)), AXM-069 (Power Law Distribution (Fat Tails))
Ergodicity (AXM-087): for the specific entity this analysis serves, does the average-case probability apply? Or is this a non-ergodic situation where path-dependent outcomes matter more? Power Law (AXM-069): if the distribution is fat-tailed, point estimates of confidence are misleading.

**Step 4: Final calibration**
_Axioms:_ AXM-094 (Map vs. Territory (Korzybski)), AXM-098 (Resulting (Annie Duke))
Map vs. Territory (AXM-094): state the gap between model confidence and real-world confidence. Resulting (AXM-098): this confidence level reflects reasoning quality, not outcome prediction.

**Techniques used:** T05 (Outside View First), T06 (Evidence Audit), T10 (Boundary Condition Check)

**Traps to watch for:**

- _Uniform confidence (everything at 0.7)_ → Different claims genuinely warrant different confidence. If everything has the same confidence, the calibration is broken.
- _False humility (everything at 0.5)_ → Some things are more knowable than others. Well-established mechanisms with strong evidence should have higher confidence than novel speculations.

**Output template:** Confidence calibration: (1) Claim classification, (2) Appropriate confidence range for claim type, (3) Overconfidence check, (4) Ergodicity assessment, (5) Final calibrated confidence with justification.

---

## Category E: "What should we recommend?" — Strategic Response

_Primary phase: Phase 3 (Backcasting)_

### Recipe E1: What are the no-regret moves?

**Question:** Identify actions that are beneficial across most scenarios, have bounded downside, and preserve future optionality. These are the highest-priority recommendations.

**When to use:** Phase 3 backcasting. The first question to answer in strategic response.

**Oracle phases:** Phase 3  
**Oracle agents:** Scenario Developer

**Steps:**

**Step 1: Screen for downside protection**
_Axioms:_ AXM-137 (Seneca's Asymmetry (Downside Dominance)), AXM-108 (Margin of Safety (Graham/Buffett))
Seneca's Asymmetry (AXM-137): does this move have bounded downside? Is the worst case survivable? Margin of Safety (AXM-108): how much buffer exists between expected outcome and disaster?

**Step 2: Test across scenarios**
_Axioms:_ AXM-092 (Antifragility), AXM-140 (Resilience vs. Robustness vs. Antifragility)
Antifragility (AXM-092): does this move benefit from uncertainty? Does it get stronger under stress? Resilience vs. Robustness vs. Antifragility (AXM-140): which type of response is this move — robust (resists change), resilient (springs back), or antifragile (gains from disorder)? Tag appropriately.

**Step 3: Check for optionality preservation**
_Axioms:_ AXM-036 (Path Dependence), AXM-062 (Switching Costs)
Path Dependence (AXM-036): does this move create lock-in that reduces future flexibility? Switching Costs (AXM-062): does it increase or decrease future switching costs? A true no-regret move preserves or increases optionality.

**Step 4: Validate via inversion**
_Axioms:_ AXM-093 (Inversion (Munger)), AXM-138 (Via Negativa (Subtraction over Addition))
Inversion (AXM-093): what would make this move regrettable? Under what conditions would it backfire? Via Negativa (AXM-138): is the no-regret move about starting something new, or about stopping something harmful? Subtraction is often more reliably no-regret than addition.

**Techniques used:** T03 (Inversion Pass), T14 (Real Options Framing), T02 (Second-Order Chain)

**Traps to watch for:**

- _False no-regret (creates hidden lock-in)_ → Check for hidden path dependence. 'Building a team in area X' is not no-regret if area X turns out to be wrong — you've created organizational commitment.
- _No-regret as excuse for indecision_ → If ALL recommendations are no-regret, the analysis hasn't produced enough insight to justify scenario-specific bets. Some scenarios warrant directional bets.

**Output template:** No-regret moves: For each move — (1) Downside bound, (2) Cross-scenario benefit score, (3) Optionality impact, (4) Inversion check, (5) Priority ranking.

---

### Recipe E2: Where are the options to buy?

**Question:** Identify small, specific investments NOW that create the ability (not obligation) to act LATER if a specific scenario materializes. Real options, not vague hedges.

**When to use:** Phase 3 backcasting. For scenario-specific recommendations that don't warrant full commitment.

**Oracle phases:** Phase 3  
**Oracle agents:** Scenario Developer

**Steps:**

**Step 1: Identify the option**
_Axioms:_ AXM-092 (Antifragility), AXM-131 (Activation Energy / Catalysts)
Antifragility (AXM-092): options create antifragility — capped downside (option cost), uncapped upside (option value if exercised). Activation Energy (AXM-131): the option reduces future activation energy, so you can move fast IF the scenario materializes.

**Step 2: Define the trigger**
_Axioms:_ AXM-084 (Regression Discontinuity / Threshold Effects), AXM-037 (Tipping Points / Phase Transitions)
Threshold Effects (AXM-084): what observable signal triggers exercising this option? Tipping Points (AXM-037): what early-warning indicators would suggest the scenario is materializing? Be specific: 'when X metric crosses Y threshold within Z timeframe.'

**Step 3: Cost the option**
_Axioms:_ AXM-018 (Opportunity Cost), AXM-013 (Diminishing Marginal Returns)
Opportunity Cost (AXM-018): what else could this investment be used for? Diminishing Returns (AXM-013): is the option premium proportional to the option value? Don't over-invest in options.

**Step 4: Assess expiration**
_Axioms:_ AXM-071 (Lindy Effect), AXM-081 (Hyperbolic Discounting)
Lindy Effect (AXM-071): how long does this option remain valid? Does it expire? Hyperbolic Discounting (AXM-081): are stakeholders undervaluing the long-term option because of preference for near-term certainty?

**Techniques used:** T14 (Real Options Framing), T13 (Threshold Identification), T15 (Temporal Decomposition)

**Traps to watch for:**

- _Confusing 'we should watch this' with 'buy an option'_ → Watching is passive. An option requires a specific investment that creates a specific capability. What exactly would you spend, and what exactly would it enable?
- _Too many options (option portfolio bloat)_ → Each option has a carrying cost. Prioritize: which scenarios have the highest expected impact AND the cheapest options to buy?

**Output template:** Options to buy: For each — (1) What to invest, (2) What capability it creates, (3) Exercise trigger (specific and observable), (4) Option cost vs. value, (5) Expiration assessment.

---

### Recipe E3: What should we stop doing?

**Question:** Via Negativa for strategy. Identify current activities, assumptions, and investments that should be stopped or reduced. Subtraction is often higher-value and lower-risk than addition.

**When to use:** Phase 3 backcasting. The counterpart to 'what should we start?' — and often more actionable.

**Oracle phases:** Phase 3  
**Oracle agents:** Scenario Developer, Red Team

**Steps:**

**Step 1: Identify subtraction candidates**
_Axioms:_ AXM-138 (Via Negativa (Subtraction over Addition)), AXM-080 (Organizational Debt), AXM-135 (Entropy (In Systems and Organizations))
Via Negativa (AXM-138): what current activities are net-negative or net-zero value? Organizational Debt (AXM-080): what legacy structures, processes, or roles are maintained from historical necessity that no longer applies? Entropy (AXM-135): what is being maintained purely to prevent degradation, without producing value?

**Step 2: Check for systems archetypes**
_Axioms:_ AXM-033 (Shifting the Burden Archetype), AXM-118 (Fixes that Fail Archetype), AXM-119 (Eroding Goals Archetype)
Shifting the Burden (AXM-033): are there symptomatic fixes that should be stopped to force fundamental solutions? Fixes that Fail (AXM-118): are there interventions that are making problems worse? Eroding Goals (AXM-119): are there areas where standards have quietly dropped?

**Step 3: Apply Chesterton's Fence before removing**
_Axioms:_ AXM-128 (Chesterton's Fence), AXM-057 (Sunk Cost Fallacy)
Chesterton's Fence (AXM-128): for each subtraction candidate — WHY does this exist? Understand before removing. Sunk Cost Fallacy (AXM-057): is the activity being maintained because of past investment rather than future value? If the reason is sunk cost, that's a strong signal to stop.

**Step 4: Assess across scenarios**
_Axioms:_ AXM-093 (Inversion (Munger)), AXM-095 (Second-Order Thinking)
Inversion (AXM-093): in which scenarios would continuing this activity be actively harmful? Second-Order Thinking (AXM-095): what becomes possible when this activity is stopped? (Freed resources, removed constraints, eliminated coordination costs.)

**Techniques used:** T03 (Inversion Pass), T08 (Binding Constraint Identification), T01 (Incentive Chain Tracing), T02 (Second-Order Chain)

**Traps to watch for:**

- _Addition bias — defaulting to 'start' recommendations_ → Ensure at least 30% of strategic recommendations are subtractive. If all recommendations are additions, the portfolio is biased.
- _Removing the wrong Chesterton's Fence_ → Step 3 is critical. Some things that look useless are load-bearing walls. Understand before removing.

**Output template:** Subtraction recommendations: For each — (1) What to stop, (2) Why it exists (Chesterton's Fence), (3) Why it should stop, (4) What stopping frees up, (5) Risk of stopping.

---

### Recipe E4: How will the competitive landscape reshape?

**Question:** Trace how the competitive structure of an industry will change under each scenario. Who wins, who loses, what new positions emerge.

**When to use:** Phase 3 scenario development. The strategic implications section of each scenario.

**Oracle phases:** Phase 3  
**Oracle agents:** Scenario Developer, Equilibrium Analyst

**Steps:**

**Step 1: Apply Wardley evolution**
_Axioms:_ AXM-064 (Wardley Mapping (Value Chain Evolution)), AXM-045 (Innovation S-Curve)
Wardley Mapping (AXM-064): where are key components moving on the evolution axis? Which are commoditizing? S-Curve (AXM-045): which technologies are plateauing, creating openings for successors?

**Step 2: Model creative destruction**
_Axioms:_ AXM-059 (Creative Destruction (Schumpeter)), AXM-039 (Christensen's Disruption Theory), AXM-139 (Niche Construction)
Creative Destruction (AXM-059): what existing value is being destroyed? By whom? Disruption Theory (AXM-039): is the disruption bottom-up (serving overlooked segments first)? Niche Construction (AXM-139): are powerful actors actively reshaping the competitive landscape?

**Step 3: Assess concentration dynamics**
_Axioms:_ AXM-049 (Winner-Take-All / Winner-Take-Most Markets), AXM-038 (Network Effects (Direct and Indirect)), AXM-117 (Success to the Successful Archetype)
Winner-Take-All (AXM-049): does this scenario strengthen or weaken WTA dynamics? Network Effects (AXM-038): how do network effects shift? Success to Successful (AXM-117): which initial advantages compound?

**Step 4: Identify new positions**
_Axioms:_ AXM-060 (Complementary Goods Dynamics), AXM-017 (Comparative Advantage), AXM-003 (Coase's Theory of the Firm)
Complementary Goods (AXM-060): what new complements emerge? Comparative Advantage (AXM-017): which capabilities become relatively more valuable? Coase's Theory (AXM-003): does the firm boundary shift?

**Step 5: Calibrate competitive response timing**
_Axioms:_ AXM-025 (Status Quo Bias), AXM-090 (Resource Curse / Paradox of Plenty), AXM-081 (Hyperbolic Discounting)
Status Quo Bias (AXM-025): incumbents will respond slower than expected. Resource Curse (AXM-090): incumbents with cash cows may under-invest in transformation. Hyperbolic Discounting (AXM-081): actors will over-invest in near-term defense vs. long-term positioning.

**Techniques used:** T01 (Incentive Chain Tracing), T02 (Second-Order Chain), T04 (Causal Loop Diagramming), T15 (Temporal Decomposition)

**Traps to watch for:**

- _Assuming the current competitive structure persists_ → Under significant change, the competitive structure itself reshapes. New categories emerge, old ones merge or disappear.
- _Single-winner predictions_ → Most competitive restructuring produces multiple winners in different niches, not a single dominant player.

**Output template:** Competitive landscape shift: (1) Wardley position changes, (2) Creative destruction map, (3) Concentration dynamics, (4) New positions and opportunities, (5) Timing of competitive response.

---

# Layer 2 — Techniques

Reusable reasoning patterns that appear across multiple recipes. These are the chopping, sautéing, and braising of analytical thinking — master these 15 techniques and you can improvise even without a matching recipe.

### T01: Incentive Chain Tracing

**Method:** For each relevant actor: (1) What are they measured on? (2) What are they rewarded for? (3) What information do they have? (4) What constraints do they face? (5) What is their rational response given 1-4? → Predicted behavior.

**Key axioms:** AXM-110 (Incentive Superpower (Munger)), AXM-016 (Principal-Agent Problem), AXM-052 (Moral Hazard), AXM-132 (Fundamental Attribution Error)

**Used in recipes:** A2, A3, B3, C4, E3, E4

**Common errors:**

- Assuming actors have the same information as the analyst
- Confusing stated goals with actual incentives
- Forgetting implicit incentives (status, cognitive comfort, career risk)

**Output:** Per-actor incentive map: Metric → Reward → Information → Constraints → Predicted behavior

---

### T02: Second-Order Chain

**Method:** For every causal claim, trace at minimum 3 steps: (1) First-order effect (direct consequence), (2) Second-order effect (response to the consequence), (3) Countervailing force (what pushes back), (4) Required conditions (what must hold for the chain to proceed). If the chain reverses sign at step 2, that's the most important finding.

**Key axioms:** AXM-095 (Second-Order Thinking), AXM-031 (Feedback Loops (Reinforcing/Balancing)), AXM-047 (Jevons Paradox (Rebound Effect))

**Used in recipes:** A4, B1, B2, B3, B5, C4, E1, E3, E4

**Common errors:**

- Stopping at step 1
- Assuming each step has the same sign as step 1
- Ignoring time delays between steps
- Forgetting that different actors drive different steps

**Output:** Causal chain: Effect₁ → Response₂ → Countervailing₃ → Conditions₄ (with time estimates per step)

---

### T03: Inversion Pass

**Method:** Instead of arguing FOR a claim or scenario, argue AGAINST it. (1) List 3-5 conditions that guarantee failure. (2) For each, assess P(condition_holds). (3) If any condition has P > 0.7, the claim is in serious trouble. (4) For each condition, identify the earliest observable indicator.

**Key axioms:** AXM-093 (Inversion (Munger)), AXM-129 (Falsifiability (Popper))

**Used in recipes:** C1, C4, E1, E3

**Common errors:**

- Weak inversion (conditions too vague to test)
- Inversion without follow-through (listing conditions but not assessing them)
- Using inversion to kill everything (the goal is to test, not to destroy)

**Output:** Failure conditions list: Condition → P(holds) → Observable indicator → Assessment

---

### T04: Causal Loop Diagramming

**Method:** Map the reinforcing and balancing feedback loops in a system. (1) Identify key variables. (2) Draw causal links with polarity (+ same direction, - opposite direction). (3) Identify loops (even number of - links = reinforcing, odd = balancing). (4) Determine which loop currently dominates. (5) Find conditions where dominance shifts.

**Key axioms:** AXM-031 (Feedback Loops (Reinforcing/Balancing)), AXM-032 (Limits to Growth Archetype), AXM-034 (Leverage Points in Systems), AXM-037 (Tipping Points / Phase Transitions)

**Used in recipes:** B1, B3, B5, C4, E4

**Common errors:**

- Mapping too many variables (focus on 5-8 key variables)
- Missing delays (delays create oscillation)
- Forgetting that loop dominance shifts over time
- Treating the map as the territory

**Output:** Loop diagram: Variables → Links with polarity → Named loops → Dominant loop → Shift conditions

---

### T05: Outside View First

**Method:** For any estimate or prediction: (1) Identify the reference class (similar past cases). (2) Find the base rate of outcomes in that class. (3) Start with the base rate as your estimate. (4) THEN adjust for specific features of this case. (5) The adjustment should be small (≤25%) unless strong evidence supports a larger adjustment.

**Key axioms:** AXM-124 (Reference Class Forecasting), AXM-101 (Base Rate Neglect (Kahneman/Tversky)), AXM-055 (Planning Fallacy), AXM-141 (Superforecasting Principles (Tetlock))

**Used in recipes:** B1, B4, C1, C2, D1, D4

**Common errors:**

- Starting with the inside view and then 'checking' against the base rate (anchoring on the inside view)
- Choosing a reference class that's too narrow (insufficient data) or too broad (irrelevant)
- Adjusting too much from the base rate based on 'this case is different'

**Output:** Calibrated estimate: Reference class → Base rate → Specific adjustments → Final estimate with confidence interval

---

### T06: Evidence Audit

**Method:** For each major claim in the analysis: (1) What's the evidence? (2) Source quality (primary/secondary/tertiary, peer-reviewed/editorial/anecdotal). (3) Recency (when was this established?). (4) Conflicts (does other evidence contradict?). (5) What would change your mind? (If nothing could, the claim is not evidence-based.)

**Key axioms:** AXM-083 (Bayes' Theorem (Belief Updating)), AXM-082 (Law of Large Numbers (Statistical Convergence)), AXM-129 (Falsifiability (Popper)), AXM-100 (WYSIATI — What You See Is All There Is (Kahneman))

**Used in recipes:** C1, C3, D1, D2

**Common errors:**

- Treating all sources as equal quality
- Not asking 'what would change my mind?'
- Counting number of sources rather than assessing independence
- Ignoring evidence that contradicts the narrative

**Output:** Per-claim evidence card: Claim → Evidence → Source quality → Recency → Conflicts → Changeability criterion

---

### T07: Lollapalooza Scan

**Method:** Count the number of independent reinforcing forces pointing in the same direction in a scenario or prediction. (1) List all causal forces. (2) Assess independence (are they truly separate or manifestations of one force?). (3) Count independent reinforcing forces. (4) If ≥3 with no identified balancing force: tag as lollapalooza candidate. (5) Check historical precedent for this level of confluence.

**Key axioms:** AXM-097 (Lollapalooza Effect (Munger)), AXM-069 (Power Law Distribution (Fat Tails)), AXM-037 (Tipping Points / Phase Transitions)

**Used in recipes:** C2

**Common errors:**

- Counting non-independent forces (three effects of one cause is not lollapalooza)
- Missing balancing forces (they're often less visible than reinforcing forces)
- Assuming lollapalooza means certain (it means higher probability of extreme outcome, not certainty)

**Output:** Lollapalooza assessment: Independent reinforcing forces → Count → Balancing forces identified → Historical precedent → Verdict

---

### T08: Binding Constraint Identification

**Method:** In any underperforming system: (1) List candidate constraints. (2) For each: if this were magically removed, would throughput increase? (3) The one where the answer is most clearly 'yes' is the binding constraint. (4) Check: is effort being directed at this constraint or elsewhere? (5) What's the next constraint after this one is relieved?

**Key axioms:** AXM-012 (Theory of Constraints (TOC)), AXM-007 (Amdahl's Law), AXM-122 (Premature Optimization)

**Used in recipes:** A3, A4, E3

**Common errors:**

- Confusing symptoms (visible problems) with the binding constraint (structural limit)
- Optimizing non-constraints (feels productive but doesn't improve throughput)
- Assuming there's only one constraint (there's one BINDING constraint, but the next one matters for planning)

**Output:** Constraint analysis: Candidates → Binding constraint (with evidence) → Current effort allocation → Next constraint

---

### T09: Anti-Availability Search

**Method:** Deliberately seek evidence that is: (1) Not recent (historical patterns, slow-moving trends). (2) Not vivid (statistical data over anecdotes). (3) Not personally experienced (other industries, geographies, time periods). (4) Not confirming (specifically seek disconfirming evidence). This counteracts the natural bias toward available, vivid, recent, confirming evidence.

**Key axioms:** AXM-102 (Availability Heuristic (Kahneman/Tversky)), AXM-023 (Confirmation Bias), AXM-054 (Survivorship Bias)

**Used in recipes:** C3, D3

**Common errors:**

- Treating this as a checkbox exercise (the value is in what you FIND, not in the search itself)
- Giving anti-available evidence less weight because it's less vivid (that's the bias reasserting itself)
- Only seeking disconfirming evidence (the goal is balance, not contrarianism)

**Output:** Anti-availability findings: Historical evidence → Statistical evidence → Cross-domain evidence → Disconfirming evidence → Impact on analysis

---

### T10: Boundary Condition Check

**Method:** For every axiom or model applied: (1) Check the axiom's stated boundary conditions. (2) Does the current context fall within those boundaries? (3) If outside boundaries: the axiom may not apply. Note this explicitly. (4) If near a boundary: the axiom applies with reduced confidence. (5) Map vs. Territory reminder: the axiom is a model, not reality.

**Key axioms:** AXM-094 (Map vs. Territory (Korzybski)), AXM-096 (Circle of Competence (Munger/Buffett))

**Used in recipes:** A1, A2, A4, B4, C1, D1, D2, D4

**Common errors:**

- Applying axioms outside their boundary conditions without noting it
- Treating boundary conditions as binary (in/out) when they're often gradual
- Forgetting that boundary conditions are themselves models and may be wrong

**Output:** Boundary check: Axiom applied → Context features → Boundary conditions met? → Confidence adjustment if near boundary

---

### T11: Integrative Synthesis

**Method:** When two models or positions conflict: (1) Articulate each position fully and fairly. (2) Identify what is TRUE and useful in each. (3) Identify the core tension — what exactly do they disagree about? (4) Ask: 'What would have to be true for both to be partially right?' (5) Construct a new model C that resolves the tension. (6) If the tension cannot be resolved: it may be a genuine tradeoff. Preserve it explicitly.

**Key axioms:** AXM-106 (Integrative Thinking (Roger Martin))

**Used in recipes:** D3

**Common errors:**

- Weak synthesis (just splitting the difference)
- Dropping the minority view instead of integrating it
- Forcing synthesis when the disagreement is genuine (some tensions cannot be resolved)

**Output:** Synthesis: Position A (what's true in it) → Position B (what's true in it) → Core tension → Integrative model C or explicit tradeoff

---

### T12: Stakeholder Incentive Map

**Method:** Comprehensive map of all relevant actors: (1) List all stakeholders affected by or affecting the situation. (2) For each: what do they want? What do they fear? What information do they have? What power do they hold? What constraints bind them? (3) Map interactions: who influences whom? Where are alliances and conflicts? (4) Identify the actors who can block change vs. enable it.

**Key axioms:** AXM-110 (Incentive Superpower (Munger)), AXM-016 (Principal-Agent Problem), AXM-125 (Skin in the Game (Taleb)), AXM-051 (Asymmetric Information (Akerlof's Lemons))

**Used in recipes:** A1, A2, B3

**Common errors:**

- Missing stakeholders (especially: regulators, adjacent industries, future entrants)
- Treating all stakeholders as equally important
- Modeling stakeholders as monolithic (organizations have internal politics)

**Output:** Stakeholder map: Per actor — Goals, Fears, Information, Power, Constraints, Interactions, Block/Enable potential

---

### T13: Threshold Identification

**Method:** Find the critical thresholds where a system's behavior changes qualitatively: (1) For each key variable, ask: at what value does the system behave DIFFERENTLY? (2) Map the variable's current position relative to the threshold. (3) Assess the direction and speed of movement toward/away from the threshold. (4) Identify early warning signals that the threshold is approaching. (5) Check for hysteresis: is the return threshold different from the forward threshold?

**Key axioms:** AXM-037 (Tipping Points / Phase Transitions), AXM-084 (Regression Discontinuity / Threshold Effects), AXM-046 (Crossing the Chasm)

**Used in recipes:** A3, B1, B4, B5, C2, E2

**Common errors:**

- Assuming thresholds are known in advance (they usually aren't — look for critical slowing down as a warning)
- Treating threshold crossing as instant (there's usually a transition period)
- Ignoring hysteresis (it may be much harder to reverse a threshold crossing than to trigger it)

**Output:** Threshold map: Variable → Threshold value (est.) → Current position → Movement direction/speed → Early warning signals → Hysteresis assessment

---

### T14: Real Options Framing

**Method:** For each strategic recommendation: (1) What is the cost to create the option? (2) What specific capability does the option create? (3) Under what conditions would you exercise it? (specific, observable triggers). (4) What is the value if exercised? (5) What happens if you don't exercise? (you lose only the option premium). (6) When does the option expire?

**Key axioms:** AXM-092 (Antifragility), AXM-018 (Opportunity Cost), AXM-131 (Activation Energy / Catalysts)

**Used in recipes:** E1, E2

**Common errors:**

- Confusing 'watching' with 'buying an option' (options require specific investment)
- Underestimating the carrying cost of options (monitoring, maintenance, opportunity cost)
- Having too many options (option portfolio bloat — each option has a cost)

**Output:** Real option card: Investment cost → Capability created → Exercise trigger → Value if exercised → Expiration → Carrying cost

---

### T15: Temporal Decomposition

**Method:** Break any 'X will happen' claim into a sequence of stages with rough timelines: (1) Preconditions — what must be true before X can begin? (are they met?) (2) Trigger — what event or threshold initiates X? (3) First-order effects — what happens immediately? (4) Second-order responses — how do actors respond? (5) New equilibrium — what's the stable state after adjustment? Assign rough timeline ranges to each stage.

**Key axioms:** AXM-055 (Planning Fallacy), AXM-076 (Amara's Law), AXM-074 (Bathtub Theorem (Stock and Flow))

**Used in recipes:** B1, B2, E4

**Common errors:**

- Compressing the timeline (things take longer than you think — AXM-055)
- Assuming all stages happen sequentially (some are parallel)
- Treating the new equilibrium as the end state (it's just the next starting point)

**Output:** Temporal decomposition: Preconditions (met?) → Trigger → Effect₁ (timeline) → Response₂ (timeline) → New equilibrium (timeline)

---

# Layer 3 — Pantry (Reverse-Indexed Axiom Library)

All 142 axioms, organized by domain, with reverse references showing which recipes and techniques use each axiom. This is how agents navigate from 'I need to cite something about network effects' to 'which recipes use network effects and how.'

## Economics (35 entries)

**AXM-003: Coase's Theory of the Firm** → _Recipes: A1, B2, E4_
Firms exist because using the market (price mechanism) has transaction costs. A firm will expand until the cost of organizing an additional transaction within the firm equals the cost of carrying out ...
_Formula:_ Firm boundary at point where: Marginal cost of internal coordination = Marginal cost of market transaction. Firm size S\* where dC_internal/dS = dC_mar...

**AXM-005: Metcalfe's Law** → _Recipes: A1_
The value of a network is proportional to the square of the number of connected users. Each new user adds value to all existing users.
_Formula:_ Network value V ∝ n² (more precisely, n(n-1)/2 potential connections). Marginal value of nth user = 2(n-1).

**AXM-006: Pareto Principle (80/20 Rule)** → _Recipes: B5_
In many systems, roughly 80% of effects come from 20% of causes. More generally, outcomes follow a power law distribution where a small number of inputs produce a disproportionate share of outputs.
_Formula:_ Power law: P(X > x) ∝ x^(-α). The 80/20 ratio is an approximation; actual ratios depend on the domain's specific power law exponent.

**AXM-010: Goodhart's Law** → _Recipes: A2, C4_
When a measure becomes a target, it ceases to be a good measure. Optimizing for a proxy metric causes agents to game the proxy rather than improve the underlying phenomenon.
_Formula:_ No closed-form. The underlying dynamic is: if agents are rewarded on metric M (proxy for goal G), they will find actions that increase M without incre...

**AXM-013: Diminishing Marginal Returns** → _Recipes: A4, B1, E2_
As one input to a production process is increased while all other inputs are held constant, the incremental output (marginal product) eventually decreases. Each additional unit of the variable input p...
_Formula:_ d²F/dx² < 0 for sufficiently large x, where F is the production function and x is the variable input. The marginal product MP = dF/dx is eventually de...

**AXM-014: Economies of Scale** → _Recipes: A1_
Average cost per unit decreases as the volume of production increases, due to fixed costs being spread over more units and operational efficiencies at larger scale.
_Formula:_ Average cost AC = (FC + VC(q))/q where FC = fixed costs, VC = variable costs. As q → ∞, AC approaches marginal variable cost. Minimum efficient scale ...

**AXM-015: Diseconomies of Scale** → _Recipes: A1_
Beyond a certain size, average costs begin to increase with scale due to coordination complexity, communication overhead, bureaucratic drag, and principal-agent problems.
_Formula:_ Average cost AC eventually increases: d²AC/dq² > 0 beyond optimal scale q\*. Coordination costs grow superlinearly (often O(n²)) while output grows lin...

**AXM-016: Principal-Agent Problem** → _Recipes: A1, A2, B3; Techniques: T01, T12_
When one party (the agent) makes decisions on behalf of another (the principal), conflicts of interest arise because the agent's incentives may not align with the principal's goals, and the principal ...
_Formula:_ Information asymmetry: Agent has private information about effort e and conditions θ. Principal observes only outcome y = f(e, θ). Optimal contract ba...

**AXM-017: Comparative Advantage** → _Recipes: A1, E4_
An entity should specialize in producing goods or services for which it has the lowest opportunity cost, even if it is not the absolute best at producing any of them. Specialization and trade make bot...
_Formula:_ Entity A has comparative advantage in Good X if: (Opportunity cost of X for A) < (Opportunity cost of X for B). Both benefit from trade even if A is b...

**AXM-018: Opportunity Cost** → _Recipes: E2; Techniques: T14_
The cost of any choice is the value of the best alternative foregone. Every resource allocation decision implicitly rejects all other possible uses of that resource.
_Formula:_ Opportunity cost of choosing A = Value of best alternative B not chosen. Rational choice requires: Expected value of A > Opportunity cost of A.

**AXM-038: Network Effects (Direct and Indirect)** → _Recipes: A1, B4, E4_
Direct: the value of a product/service increases as more people use it (e.g., telephone). Indirect: the value increases because more users attract more complementary goods (e.g., app ecosystem).
_Formula:_ Direct: User value Vᵢ = f(N) where N = total users, f' > 0. Indirect: Value Vᵢ = g(N_complements) where N_complements = h(N_users), creating a two-sid...

**AXM-039: Christensen's Disruption Theory** → _Recipes: B1, E4_
Established companies rationally focus on their most profitable customers, creating an opening for new entrants who serve overlooked segments with simpler, cheaper products. Over time, the entrant's p...
_Formula:_ No closed-form. Key dynamic: Incumbent improves on trajectory T₁ (overshooting mainstream needs), while entrant starts at lower performance but on ste...

**AXM-045: Innovation S-Curve** → _Recipes: B1, B4, E4_
Technologies follow an S-shaped performance trajectory: slow initial progress (exploration), rapid improvement (exploitation), and eventual plateau (diminishing returns as physical/theoretical limits ...
_Formula:_ Logistic function: P(t) = K / (1 + e^(-r(t-t₀))) where P = performance, K = theoretical limit, r = improvement rate, t₀ = inflection point.

**AXM-046: Crossing the Chasm** → _Recipes: B1, B4; Techniques: T13_
Technology adoption follows a bell curve (innovators → early adopters → early majority → late majority → laggards), but there is a critical gap ('chasm') between early adopters and early majority that...
_Formula:_ Adoption: ~2.5% innovators, ~13.5% early adopters, ~34% early majority, ~34% late majority, ~16% laggards. The chasm exists between the 16th and 50th ...

**AXM-047: Jevons Paradox (Rebound Effect)** → _Recipes: B1, B2; Techniques: T02_
When technological progress increases the efficiency of using a resource, the rate of consumption of that resource may increase rather than decrease, because lower effective cost increases demand.
_Formula:_ If efficiency doubles (cost per unit halves), demand may more than double if price elasticity > 1. Total consumption = (consumption per unit / efficie...

**AXM-048: Induced Demand** → _Recipes: B1, B2_
Increasing the supply of a resource (especially at lower cost) generates new demand that did not previously exist. The new capacity is consumed not by existing users doing the same thing more efficien...
_Formula:_ Related to Jevons: New total demand D_new = D_existing × (1 + rebound%) + D_induced. D_induced represents entirely new use cases enabled by the cost r...

**AXM-049: Winner-Take-All / Winner-Take-Most Markets** → _Recipes: A1, B2, E4_
In some markets, small differences in quality, timing, or market share lead to very large differences in rewards. The top performer captures a disproportionate share of the market, leaving little for ...
_Formula:_ Market share distribution follows a power law: Share_rank_r ∝ 1/r^α. In strong WTA markets, α > 1 (the leader takes >50% of the market).

**AXM-051: Asymmetric Information (Akerlof's Lemons)** → _Recipes: A1; Techniques: T12_
When one party in a transaction has more information than the other, markets can fail. Sellers of high-quality goods exit because buyers cannot distinguish quality, driving average quality down (adver...
_Formula:_ If quality q is distributed [q_low, q_high] and buyers observe only average quality E[q], they pay for average quality. Sellers with q > E[q] exit. Ne...

**AXM-052: Moral Hazard** → _Recipes: A2, C4; Techniques: T01_
When an entity is insulated from risk, it behaves differently (and more recklessly) than it would if fully exposed to the consequences of its actions.
_Formula:_ Agent's optimal effort e* decreases as insurance/protection increases. Without monitoring: e* = argmax [B(e) - C(e)·(1-insurance_fraction)].

**AXM-058: Supply and Demand Equilibrium** → _Recipes: A1_
Market price and quantity are determined by the intersection of supply and demand curves. When supply exceeds demand, prices fall; when demand exceeds supply, prices rise. The market tends toward equi...
_Formula:_ Equilibrium at (P*, Q*) where: Q_demand(P*) = Q_supply(P*). Price elasticity of demand: ε_d = (% change in Q_d)/(% change in P). Price elasticity of s...

**AXM-059: Creative Destruction (Schumpeter)** → _Recipes: B1, B2, E4_
Capitalist economic development proceeds through a process where new innovations destroy the value of existing structures, firms, and business models. This destruction is not a bug but the essential m...
_Formula:_ No closed-form. The dynamic: Innovation I creates new value V_new while destroying existing value V_old. Net social value may be positive (V_new > V_o...

**AXM-060: Complementary Goods Dynamics** → _Recipes: A1, B2, E4_
When two goods are complements (consumed together), making one cheaper/better increases demand for the other. Strategic implication: commoditize your complement to capture more value in your core prod...
_Formula:_ Cross-price elasticity: ε_AB = (% change in demand for A)/(% change in price of B) < 0 for complements. If B becomes free, demand for A increases by |...

**AXM-061: Two-Sided Markets / Platform Economics** → _Recipes: A1_
A platform creates value by connecting two distinct user groups, where the value to each group depends on the number and quality of users on the other side. The platform must solve the chicken-and-egg...
_Formula:_ Value to side A: V_A = f(N_B, quality_B). Value to side B: V_B = g(N_A, quality_A). Platform captures value through: transaction fees, subscriptions, ...

**AXM-062: Switching Costs** → _Recipes: A1, A3, B3, B4, E1_
The costs incurred by a buyer when changing from one supplier/product to another. These include financial costs, learning costs, data migration costs, relationship costs, and psychological costs.
_Formula:_ Buyer switches when: V_new - V_current > Switching_cost. Where Switching_cost = C_financial + C_learning + C_data + C_relationship + C_psychological. ...

**AXM-064: Wardley Mapping (Value Chain Evolution)** → _Recipes: A1, B2, E4_
Components of a value chain evolve through stages: Genesis (novel, uncertain) → Custom (understood but bespoke) → Product (standardized, competitive) → Commodity (utility, interchangeable). Strategy d...
_Formula:_ No closed-form. The evolution axis represents decreasing uncertainty and increasing standardization. Components on the left (genesis) require explorat...

**AXM-068: Wright's Law (Learning Curve / Experience Curve)** → _Recipes: B2_
The cost of producing a unit decreases by a consistent percentage each time cumulative production doubles. This applies to manufacturing, software, and any activity with learning-by-doing.
_Formula:_ Cost per unit C(n) = C(1) · n^(-α) where n = cumulative production, α = learning rate parameter. Typical cost reduction: 10–30% per doubling of cumula...

**AXM-076: Amara's Law** → _Recipes: B1, B4; Techniques: T15_
We tend to overestimate the effect of a technology in the short run and underestimate the effect in the long run. Initial hype exceeds near-term reality, but long-term transformation exceeds what most...
_Formula:_ No closed-form. Maps to the Gartner Hype Cycle: Peak of Inflated Expectations → Trough of Disillusionment → Slope of Enlightenment → Plateau of Produc...

**AXM-087: Ergodicity (Non-Ergodic Systems)** → _Recipes: C2, D1, D4_
A system is ergodic if the time-average of one entity's outcomes equals the ensemble average across many entities. Most economic and strategic situations are non-ergodic: what happens on average acros...
_Formula:_ Ergodic: lim(T→∞) (1/T)·∫₀ᵀ f(x(t))dt = E[f(X)]. Non-ergodic: the time average ≠ ensemble average. In multiplicative dynamics (compounding gains/losse...

**AXM-088: Gresham's Law (Bad Drives Out Good)** → _Recipes: B2_
When two forms of commodity money are in circulation, the 'bad' (overvalued) money drives out the 'good' (undervalued) money. More generally: in any system where two qualities can substitute, the lowe...
_Formula:_ If goods A (high quality) and B (low quality) are treated as equivalent, rational agents hoard A and circulate B. Market share of B → 1 as t → ∞ witho...

**AXM-090: Resource Curse / Paradox of Plenty** → _Recipes: E4_
Entities with abundant access to a valuable resource often underperform those without it, because the resource creates complacency, misallocation, and failure to develop diverse capabilities.
_Formula:_ No closed-form. The mechanism: abundant resource R → reduced incentive to optimize → reduced capability diversity → vulnerability when R declines or b...

**AXM-108: Margin of Safety (Graham/Buffett)** → _Recipes: E1_
Build a buffer between what you expect and what you plan for. The margin of safety accounts for errors in analysis, unexpected changes, and the limits of knowledge. Never operate at the theoretical li...
_Formula:_ Required margin = f(uncertainty, consequence_of_failure, reversibility). Plan for value V_target = V_estimated × (1 - margin). Margin should increase ...

**AXM-110: Incentive Superpower (Munger)** → _Recipes: A2, A3, B3, C4; Techniques: T01, T12_
Never, ever, think about something else when you should be thinking about the power of incentives. Incentives are the most powerful force in shaping human behavior. If you want to predict what people ...
_Formula:_ Behavior B ≈ argmax(incentive_function). Where incentive_function includes: financial rewards, social status, autonomy, career advancement, risk avoid...

**AXM-125: Skin in the Game (Taleb)** → _Recipes: B3; Techniques: T12_
Systems function better when decision-makers bear the consequences of their decisions. When there is no skin in the game (asymmetric payoffs where you benefit from upside but don't suffer downside), d...
_Formula:_ Decision quality D ∝ symmetry of payoff. If payoff is asymmetric: upside captured, downside transferred → agent takes excessive risk. If payoff is sym...

**AXM-127: Cobra Effect (Perverse Incentives)** → _Recipes: A3, C4_
A well-intentioned intervention creates incentives that make the original problem worse. Named after the British colonial program that paid for dead cobras in Delhi — which led to cobra breeding farms...
_Formula:_ Intervention I designed to reduce Problem P. But I creates incentive to produce P' (new instances of P or a related problem). If rate of P' production...

**AXM-137: Seneca's Asymmetry (Downside Dominance)** → _Recipes: C2, E1_
The potential downside of a decision often matters more than the potential upside because losses are harder to recover from than gains are to accumulate. In non-ergodic systems, a single catastrophic ...
_Formula:_ For multiplicative processes: E[long-run outcome] is dominated by worst outcomes because (1-0.5) × (1+1.0) = 1.0 (50% loss followed by 100% gain = bre...

---

## Cognitive Science (49 entries)

**AXM-002: Miller's Law (Working Memory Limit)** → _Reference only (not in active recipes)_
The average human can hold 7 ± 2 items in working memory simultaneously. This creates a hard ceiling on the number of independent variables a person can reason about in real-time.
_Formula:_ Working memory capacity ≈ 7 ± 2 chunks. Effective capacity decreases under cognitive load, time pressure, or emotional stress.

**AXM-004: Dunbar's Number** → _Recipes: A2_
There is a cognitive limit to the number of stable social relationships a human can maintain, approximately 150. This arises from neocortex size constraints and the cognitive cost of tracking social r...
_Formula:_ ~150 stable relationships (range: 100–250). Nested layers: ~5 intimate, ~15 close, ~50 friends, ~150 acquaintances. Each layer ~3x the previous.

**AXM-019: Prospect Theory (Loss Aversion)** → _Reference only (not in active recipes)_
People evaluate outcomes relative to a reference point, not in absolute terms. Losses loom larger than equivalent gains (approximately 2x). This causes risk-aversion for gains and risk-seeking for los...
_Formula:_ Value function v(x) is concave for gains, convex for losses, and steeper for losses: v(-x) ≈ -2·v(x). Probability weighting: overweight small probabil...

**AXM-020: Cognitive Load Theory** → _Recipes: B4_
Working memory has limited capacity. Learning and performance degrade when the total cognitive load (intrinsic complexity + extraneous complexity + germane processing) exceeds working memory capacity.
_Formula:_ Total cognitive load = Intrinsic load (task complexity) + Extraneous load (poor design/process) + Germane load (learning effort). Performance degrades...

**AXM-021: Attention as Scarce Resource (Simon's Attention Economics)** → _Recipes: B2_
In an information-rich world, the wealth of information creates a poverty of attention. The scarce resource is not information but the cognitive capacity to process it.
_Formula:_ No closed-form. The relationship is inverse: as available information I increases, attention per unit a(I) = A_total / I decreases, where A_total is f...

**AXM-022: Bounded Rationality** → _Recipes: B3_
Human decision-makers have limited cognitive resources, information, and time. Rather than optimizing (finding the best solution), they satisfice (find a solution that meets a minimum threshold of acc...
_Formula:_ Instead of max U(x) over all x, agents search sequentially and stop at first x where U(x) ≥ threshold. Search cost c per option means optimal stopping...

**AXM-023: Confirmation Bias** → _Recipes: C1, C3, D3; Techniques: T09_
People tend to search for, interpret, and recall information in ways that confirm their pre-existing beliefs. Disconfirming evidence is systematically underweighted or ignored.
_Formula:_ Bayesian update with biased likelihood: P(H|E) is overestimated when E supports H and underestimated when E contradicts H, relative to Bayes' theorem.

**AXM-024: Anchoring Effect** → _Recipes: B1, C3, D1_
An initial piece of information (the anchor) disproportionately influences subsequent judgments. Adjustments from the anchor are typically insufficient, even when the anchor is arbitrary.
_Formula:_ Estimate E = Anchor + α·(True value - Anchor) where α < 1 (insufficient adjustment). Typical α ≈ 0.3–0.5.

**AXM-025: Status Quo Bias** → _Recipes: A3, B3, B4, E4_
People prefer the current state of affairs. The default option is disproportionately chosen, even when alternatives are objectively superior, because changing requires effort and incurs perceived risk...
_Formula:_ Related to loss aversion: changing from status quo frames potential losses more saliently than potential gains. Switching cost (real + psychological) ...

**AXM-053: Regression to the Mean** → _Recipes: C3_
Extreme observations tend to be followed by more moderate ones, purely due to random variation. This is a statistical phenomenon, not a causal one, but humans routinely attribute causal explanations t...
_Formula:_ If X₁ is extreme (far from μ), then E[X₂|X₁] is closer to μ than X₁ is. The correlation between X₁ and X₂ determines the degree of regression: E[X₂|X₁...

**AXM-054: Survivorship Bias** → _Recipes: A1, B4, C1, C3; Techniques: T09_
Drawing conclusions from a sample that includes only successes while excluding failures. The observed patterns in 'what works' may reflect selection effects rather than causal relationships.
_Formula:_ If success probability P(S) is low and observation is conditional on survival: P(Feature|Survived) ≠ P(Feature causes survival). The feature may be eq...

**AXM-055: Planning Fallacy** → _Recipes: B1, D1; Techniques: T05, T15_
People systematically underestimate the time, cost, and risk of future actions while overestimating their benefits. This applies even when they have direct experience with similar past overruns.
_Formula:_ Actual duration/cost ≈ Planned × (1.5 to 3.0) for most project types. Flyvbjerg: average cost overrun for IT projects ≈ 73%, infrastructure ≈ 34%. The...

**AXM-056: Curse of Knowledge** → _Recipes: A2_
Once you know something, it becomes very difficult to imagine not knowing it. Experts systematically overestimate how much others understand, leading to communication failures and poor design decision...
_Formula:_ No closed-form. The mechanism: knowledge changes the mental model such that the un-informed state becomes cognitively inaccessible. Estimates of other...

**AXM-057: Sunk Cost Fallacy** → _Recipes: A3, E3_
People continue investing in a losing proposition because of previously invested resources (time, money, effort) that cannot be recovered. Rational decision-making should consider only future costs an...
_Formula:_ Rational: Continue if E[future benefit] > E[future cost]. Biased: Continue if E[future benefit] + sunk_cost > E[future cost], where sunk_cost should n...

**AXM-065: Hick's Law (Choice Overload)** → _Recipes: B4_
The time to make a decision increases logarithmically with the number of choices. Too many options can lead to decision paralysis, reduced satisfaction, and avoidance of choosing altogether.
_Formula:_ Decision time T = a + b·log₂(n+1) where n = number of equally probable alternatives, a = base reaction time, b = per-bit processing time.

**AXM-066: Yerkes-Dodson Law** → _Reference only (not in active recipes)_
Performance increases with arousal/stress up to a point, after which further arousal degrades performance. The optimal level of arousal is lower for complex tasks and higher for simple tasks.
_Formula:_ Inverted U-curve: Performance P = -a·(arousal - optimal)² + P_max. Optimal arousal is lower for tasks with high cognitive complexity.

**AXM-067: Dunning-Kruger Effect** → _Recipes: D1, D4_
People with low competence in a domain tend to overestimate their ability, while experts tend to underestimate theirs. The unskilled lack the metacognitive ability to recognize their incompetence.
_Formula:_ Self-assessment error = Perceived skill - Actual skill. For low actual skill: error > 0 (overestimate). For high actual skill: error < 0 (underestimat...

**AXM-081: Hyperbolic Discounting** → _Recipes: E2, E4_
People disproportionately prefer smaller, sooner rewards over larger, later rewards. The discount rate is not constant but decreases with time horizon — people are very impatient in the short term but...
_Formula:_ Discount function: D(t) = 1/(1 + k·t) where k = discount rate (hyperbolic), versus exponential discounting D(t) = δ^t. Hyperbolic discounting leads to...

**AXM-086: Satisficing vs. Optimizing** → _Reference only (not in active recipes)_
Satisficing (choosing the first option that meets a minimum threshold) is often more effective than optimizing (searching for the best possible option) when search costs are high, information is incom...
_Formula:_ Optimal search: continue searching while E[improvement from next option] > cost of search. In practice: search cost is often underestimated and improv...

**AXM-093: Inversion (Munger)** → _Recipes: C1, E1, E3; Techniques: T03_
Instead of asking 'how do I achieve X?', ask 'what would guarantee failure at X?' and then avoid those things. Many hard problems become tractable when inverted. Avoiding stupidity is easier and more ...
_Formula:_ To maximize f(x), study the conditions that minimize f(x) and ensure they are absent. Formally: argmax f(x) is hard; identifying and excluding the set...

**AXM-094: Map vs. Territory (Korzybski)** → _Recipes: C1, D4; Techniques: T10_
All models, frameworks, and representations are simplifications of reality. The map is not the territory — it is a useful abstraction that necessarily omits detail. Confusing the model with reality le...
_Formula:_ For any model M of reality R: M ⊂ R (M is a strict subset of R). All models have an error term: R = M + ε where ε is the irreducible gap between model...

**AXM-095: Second-Order Thinking** → _Recipes: B1, B2, B3, C4, E3; Techniques: T02_
First-order thinking asks 'what happens next?' Second-order thinking asks 'and then what?' Most people and organizations stop at first-order effects. Competitive advantage and strategic foresight come...
_Formula:_ For action A with first-order effect E₁: E₂ = response(E₁, system_state). E₃ = response(E₂, system_state + E₁). The chain E₁ → E₂ → E₃ often reverses ...

**AXM-096: Circle of Competence (Munger/Buffett)** → _Recipes: C3; Techniques: T10_
Every person and system has a domain where their knowledge is deep and reliable, and a much larger domain where it is shallow. The key skill is knowing the boundary of your circle — operating inside i...
_Formula:_ Decision quality D = f(knowledge_depth, calibration). Inside circle: knowledge_depth is high, calibration is good → D is high. Outside circle: knowled...

**AXM-097: Lollapalooza Effect (Munger)** → _Recipes: C2; Techniques: T07_
When multiple cognitive biases, social forces, or systemic tendencies operate in the same direction simultaneously, the combined effect is far greater than the sum of individual effects. Extreme outco...
_Formula:_ If individual effects are multiplicative rather than additive: Combined effect = Π(1 + eᵢ) >> Σeᵢ for n concurrent effects. When 5 biases each add 20%...

**AXM-098: Resulting (Annie Duke)** → _Recipes: D2, D4_
Judging the quality of a decision by the quality of its outcome rather than the quality of the reasoning process. Good decisions can lead to bad outcomes (and vice versa) because of irreducible uncert...
_Formula:_ Decision quality Q_d = f(process, information, reasoning). Outcome quality Q_o = f(Q_d, luck, unknowns). Correlation ρ(Q_d, Q_o) < 1, especially for s...

**AXM-099: System 1 / System 2 Thinking (Kahneman)** → _Recipes: D3_
The mind operates two systems: System 1 (fast, automatic, intuitive, effortless, error-prone) and System 2 (slow, deliberate, analytical, effortful, more accurate). Most decisions are made by System 1...
_Formula:_ Decision = System1_output if (confidence > threshold AND cognitive_load < capacity). Decision = System2_override if (System1_confidence < threshold OR...

**AXM-100: WYSIATI — What You See Is All There Is (Kahneman)** → _Recipes: A3, C1, C3, D2, D4; Techniques: T06_
The mind constructs the best possible story from the information currently available, with no awareness of what information is missing. Confidence is determined by the coherence of the story, not by t...
_Formula:_ Subjective confidence C = f(narrative_coherence) rather than C = f(evidence_quality, evidence_completeness). Even with very little evidence, if the st...

**AXM-101: Base Rate Neglect (Kahneman/Tversky)** → _Recipes: C2, D1; Techniques: T05_
People tend to ignore or underweight the base rate (prior probability) when evaluating specific cases, especially when vivid or narrative information is available. They substitute representativeness f...
_Formula:_ Correct: P(H|E) = P(E|H)·P(H)/P(E) (Bayes). Biased: P(H|E) ≈ P(E|H) — the base rate P(H) is dropped. If 1% of companies are unicorns, but a company 'l...

**AXM-102: Availability Heuristic (Kahneman/Tversky)** → _Recipes: C2, C3; Techniques: T09_
People estimate the probability of events based on how easily examples come to mind (availability in memory), not on actual frequency. Memorable, vivid, or recent events are judged as more probable th...
_Formula:_ Estimated probability P_est(E) ∝ ease_of_recall(E), not actual P(E). Recent, dramatic, or personally experienced events have high ease_of_recall regar...

**AXM-103: Narrative Fallacy (Taleb/Kahneman)** → _Recipes: C1, C2, D2_
Humans are compelled to create coherent narratives to explain events, even when the events are driven by randomness or complexity that defies simple storytelling. After the fact, we construct causal s...
_Formula:_ Post-hoc narrative compression: Complex event E with causes {c₁...cₙ} and random factors {r₁...rₘ} is explained as: 'E happened because of c₁ and c₂' ...

**AXM-104: Occam's Razor** → _Recipes: C1, D2_
Among competing explanations that equally account for the evidence, the simplest one (fewest assumptions) should be preferred. Complexity should not be added without necessity.
_Formula:_ Model selection: prefer model M₁ over M₂ if both explain the data equally well and M₁ has fewer free parameters. Bayesian version: simpler models have...

**AXM-105: Hanlon's Razor** → _Recipes: A2_
Never attribute to malice that which is adequately explained by incompetence, incentives, or structural constraints. Most organizational behavior that looks irrational or malicious is actually a ratio...
_Formula:_ P(malice | bad_outcome) << P(misaligned_incentives | bad_outcome) + P(information_asymmetry | bad_outcome) + P(structural_constraint | bad_outcome) in...

**AXM-106: Integrative Thinking (Roger Martin)** → _Recipes: D3; Techniques: T11_
When faced with opposing models or options, resist the pressure to choose one or compromise. Instead, use the tension between opposing ideas as creative fuel to generate a new model that contains elem...
_Formula:_ Given models M_A and M_B where each captures different aspects of reality R: Conventional thinking: choose max(utility(M_A), utility(M_B)). Integrativ...

**AXM-107: Thought Experiments** → _Reference only (not in active recipes)_
Using structured imagination to explore scenarios that cannot be observed directly. A thought experiment proposes a hypothetical situation, applies known principles rigorously, and traces the conseque...
_Formula:_ Formally: Given system state S and known laws L, modify one variable: S' = S[v → v']. Apply L to S' and trace consequences: outcome O = L(S'). The rig...

**AXM-109: Multi-Disciplinary Lattice (Munger)** → _Recipes: C3_
Complex problems require mental models from multiple disciplines. A person with only one framework sees every problem through that lens (man with a hammer). True understanding comes from building a la...
_Formula:_ Problem understanding U = f(Σ relevant_models × cross_domain_connections). Single-model understanding U₁ << multi-model understanding Uₙ because: cros...

**AXM-111: Probabilistic Thinking** → _Recipes: D1, D4_
Thinking in probabilities rather than certainties. The world is fundamentally uncertain — expressing beliefs as probability distributions rather than point estimates better reflects reality and enable...
_Formula:_ Replace 'X will happen' with 'P(X) = 0.7, with 80% confidence interval [0.5, 0.85].' For decisions: Expected Value = Σ P(outcome_i) × Value(outcome_i)...

**AXM-112: Pre-Mortem (Klein)** → _Reference only (not in active recipes)_
Before making a decision or launching a plan, imagine it has already failed spectacularly. Then work backward: 'What went wrong?' This overcomes optimism bias and groupthink by making it psychological...
_Formula:_ Standard risk assessment: P(risk) × Impact — but optimism bias causes systematic underestimation of P(risk). Pre-mortem reframes: assume P(failure) = ...

**AXM-113: Distributed Cognition / Extended Mind (Clark & Chalmers)** → _Reference only (not in active recipes)_
Cognition does not happen only inside the brain. It extends into the environment through tools, notes, other people, and technology. Cognitive capacity is a function of the system (brain + tools + env...
_Formula:_ Effective cognitive capacity C_eff = C_brain + C_tools + C_social - C_coordination. Where C_tools = capacity added by external aids (notes, software, ...

**AXM-114: Default Effect (Parrish)** → _Recipes: A3, B4_
People overwhelmingly stick with whatever option is the default, regardless of whether it is optimal. The power of defaults comes from: inertia (effort to change), implicit recommendation (the default...
_Formula:_ P(choosing_default) >> P(choosing_alternative) even when utility(alternative) > utility(default). The difference grows with: switching cost, complexit...

**AXM-115: Velocity vs. Speed (Parrish)** → _Reference only (not in active recipes)_
Speed is how fast you move. Velocity is speed with direction. Organizations and individuals can be extremely busy (high speed) while making little progress (low velocity) because effort is undirected,...
_Formula:_ Velocity v = speed × cos(θ) where θ = angle between effort direction and goal direction. If effort is 90° from goal (busy but misaligned), velocity = ...

**AXM-121: Hindsight Bias (Kahneman)** → _Recipes: C3, D2_
After learning an outcome, people believe they 'knew it all along.' The known outcome distorts memory of what was actually predictable at the time. This creates an illusion of predictability that infl...
_Formula:_ Before outcome: P_estimated(E) = p. After outcome (E occurred): P_recalled(E) >> p. The 'I knew it all along' effect makes the world seem more predict...

**AXM-123: First Conclusion Bias** → _Recipes: C3_
The tendency to stop searching for solutions after finding the first adequate one. Related to satisficing but more insidious: people treat the first answer as THE answer and then selectively seek evid...
_Formula:_ Search stops at first option O where utility(O) > threshold, even if P(∃ O' : utility(O') >> utility(O)) is high. The first conclusion then anchors al...

**AXM-124: Reference Class Forecasting** → _Recipes: B1, B4, C2, D1; Techniques: T05_
To estimate the outcome of a specific project or event, look at the statistical outcomes of similar past projects or events (the reference class), rather than building a bottom-up estimate from the sp...
_Formula:_ Inside view estimate: E_inside = f(specific_case_details). Outside view estimate: E_outside = mean(reference_class_outcomes). Better estimate: E_combi...

**AXM-126: Deliberate Practice vs. Naive Practice (Ericsson)** → _Reference only (not in active recipes)_
Expertise is not a function of time spent but of the quality of practice. Deliberate practice involves: working at the edge of current ability, immediate feedback, focused repetition on weaknesses, an...
_Formula:_ Skill S(t) = S(0) + ∫₀ᵗ learning_rate(practice_quality) dt. For naive practice: learning_rate → 0 after initial phase. For deliberate practice: learni...

**AXM-128: Chesterton's Fence** → _Recipes: A1, A2, C4, E3_
Before removing a system, practice, or institution, you must first understand why it was put there. If you don't know why it exists, you don't have enough information to know the consequences of remov...
_Formula:_ P(unintended_consequences | removal_without_understanding) >> P(unintended_consequences | removal_with_understanding). The information value of unders...

**AXM-132: Fundamental Attribution Error** → _Recipes: A2, B3; Techniques: T01_
People attribute others' behavior to character (dispositional causes) while attributing their own behavior to circumstances (situational causes). This leads to systematic misunderstanding of why peopl...
_Formula:_ Explanation of Other's behavior B: P(dispositional|B) is overestimated, P(situational|B) is underestimated. For own behavior: reversed. True B = f(dis...

**AXM-138: Via Negativa (Subtraction over Addition)** → _Recipes: E1, E3_
Improvement often comes more reliably from removing what is wrong than from adding what might be right. Subtracting errors, inefficiencies, and harmful practices is lower-risk and more tractable than ...
_Formula:_ Expected value of subtraction E[V_subtract] often > E[V_add] because: P(correctly_identifying_problems) > P(correctly_identifying_solutions), and risk...

**AXM-141: Superforecasting Principles (Tetlock)** → _Recipes: D1, D4; Techniques: T05_
The best forecasters share specific cognitive practices: they think in probabilities not certainties, update beliefs incrementally based on evidence, consider multiple perspectives before forming a vi...
_Formula:_ Forecasting accuracy measured by Brier Score: BS = (1/N)·Σ(pᵢ - oᵢ)² where pᵢ = predicted probability and oᵢ = outcome (0 or 1). Lower = better. Super...

**AXM-142: Cognitive Forcing Functions** → _Reference only (not in active recipes)_
Deliberate structures in a decision process that force engagement of System 2 thinking at critical moments. Checklists, red teams, stage gates, mandatory devil's advocacy, and pre-mortems are all cogn...
_Formula:_ Decision quality D = D*system1 × P(system1_adequate) + D_system2 × P(forcing_function_triggers_system2). Adding forcing functions increases P(system2*...

---

## Systems Dynamics (29 entries)

**AXM-012: Theory of Constraints (TOC)** → _Recipes: A4, B1; Techniques: T08_
A system's throughput is limited by its single tightest constraint (bottleneck). Improving anything other than the bottleneck does not improve system throughput. Improvement of the bottleneck improves...
_Formula:_ System throughput T = min(T₁, T₂, ... Tₙ) where Tᵢ is the throughput of component i. Only improving the component where Tᵢ = T changes overall through...

**AXM-031: Feedback Loops (Reinforcing/Balancing)** → _Recipes: B1, B2, B3, B5, C2, C4; Techniques: T02, T04_
Reinforcing (positive) feedback loops amplify change — growth begets more growth, decline accelerates decline. Balancing (negative) feedback loops resist change and push toward equilibrium. System beh...
_Formula:_ Reinforcing: dx/dt = r·x → exponential growth/decay. Balancing: dx/dt = r·(target - x) → convergence to target. Real systems have both: dx/dt = r₊·x -...

**AXM-032: Limits to Growth Archetype** → _Recipes: A4, B1, B5; Techniques: T04_
A reinforcing growth process inevitably encounters a balancing constraint that slows and eventually stops growth. If the constraint is not identified and addressed, growth stalls or reverses.
_Formula:_ Logistic growth: dx/dt = r·x·(K-x)/K where K = carrying capacity. S-curve: initial exponential → inflection → asymptotic approach to K.

**AXM-033: Shifting the Burden Archetype** → _Recipes: A2, A3, A4, C4, E3_
A symptomatic solution is applied to a problem, reducing pressure to implement a fundamental solution. The symptomatic fix creates side effects that further undermine the fundamental solution, creatin...
_Formula:_ No closed-form. Structure: Problem → Symptomatic fix (fast, easy) reduces Problem pressure. Problem → Fundamental fix (slow, hard) reduces Problem per...

**AXM-034: Leverage Points in Systems** → _Recipes: A3, B5; Techniques: T04_
Places within a complex system where a small shift can produce big changes in system behavior. The most effective interventions target the system's structure (feedback loops, information flows, rules,...
_Formula:_ Meadows' hierarchy of leverage points (increasing effectiveness): 12. Constants/parameters → 11. Buffer sizes → 10. Stock/flow structure → 9. Delays →...

**AXM-035: Emergence** → _Reference only (not in active recipes)_
Complex system-level behaviors arise from the interaction of simpler components, where the emergent behavior is not predictable from the properties of individual components alone. The whole exhibits p...
_Formula:_ No closed-form. The key property: F(system) ≠ Σ F(components). System behavior requires modeling interactions, not just aggregating component behavior...

**AXM-036: Path Dependence** → _Recipes: A1, A3, E1_
Outcomes are sensitive to the sequence of past events, not just current conditions. Early events, even small or random ones, can lock in particular paths that become increasingly costly to reverse due...
_Formula:_ Pólya urn model: probability of choosing color A increases with the number of A already drawn. P(A at step n) = n_A / (n_A + n_B). Self-reinforcing: e...

**AXM-037: Tipping Points / Phase Transitions** → _Recipes: A1, A3, B1, B5, C2, E2; Techniques: T04, T07, T13_
A critical threshold beyond which a small perturbation causes a rapid, often irreversible shift in system state. The system transitions from one stable equilibrium to another.
_Formula:_ Bifurcation: system has two stable states S₁ and S₂ separated by an unstable threshold. At the tipping point, the energy barrier between states → 0 an...

**AXM-050: Gall's Law** → _Reference only (not in active recipes)_
A complex system that works is invariably found to have evolved from a simple system that worked. A complex system designed from scratch never works and cannot be patched up to make it work. You have ...
_Formula:_ No closed-form. The principle is about evolutionary viability: complexity must be built incrementally, with each intermediate state being functional.

**AXM-069: Power Law Distribution (Fat Tails)** → _Recipes: C2, D1, D4; Techniques: T07_
In many natural and social systems, the distribution of outcomes follows a power law rather than a normal distribution. Extreme events are far more likely than a normal distribution predicts. The 'tai...
_Formula:_ P(X > x) ∝ x^(-α). For α ≤ 2, variance is infinite (extreme events dominate). For α ≤ 1, even the mean is infinite. Contrast: normal distribution tail...

**AXM-071: Lindy Effect** → _Recipes: B4, E2_
For non-perishable entities (technologies, ideas, cultural artifacts), life expectancy is proportional to current age. Something that has survived for a long time is likely to survive for a long time ...
_Formula:_ Expected remaining lifespan E[T_remaining | T_survived = t] ∝ t. For power-law distributed lifespans: E[T_remaining] = t·α/(α-1) for α > 1.

**AXM-072: Little's Law** → _Recipes: B5_
In a stable system, the average number of items in the system equals the average arrival rate multiplied by the average time each item spends in the system.
_Formula:_ L = λ · W where L = average items in system, λ = average arrival rate, W = average time in system. Applies to any stable queuing system.

**AXM-073: Law of Requisite Variety (Ashby's Law)** → _Recipes: B5_
A system's ability to control its environment requires at least as much variety (possible states) in the controller as in the system being controlled. Only variety can absorb variety.
_Formula:_ Variety of controller V_C ≥ Variety of disturbances V_D for effective regulation. If V_C < V_D, some disturbances will not be controlled.

**AXM-074: Bathtub Theorem (Stock and Flow)** → _Recipes: B5; Techniques: T15_
The level of any accumulation (stock) changes only through its inflows and outflows. The rate of change of a stock = inflow rate - outflow rate. People systematically fail to reason correctly about st...
_Formula:_ dS/dt = Inflow(t) - Outflow(t). Stock at time T: S(T) = S(0) + ∫₀ᵀ [Inflow(t) - Outflow(t)] dt.

**AXM-084: Regression Discontinuity / Threshold Effects** → _Recipes: B5, C2, E2; Techniques: T13_
In many systems, outcomes change discontinuously at specific thresholds rather than continuously. Crossing a threshold triggers qualitatively different dynamics — not just 'more of the same.'
_Formula:_ System behavior B(x) has discontinuity at threshold x*: lim(x→x*⁻) B(x) ≠ lim(x→x*⁺) B(x). Small changes near x* produce large changes in B.

**AXM-091: Reflexivity (Soros)** → _Recipes: B2, B3, B5, C3_
In social systems, participants' beliefs about the system alter the system itself, creating a feedback loop between perception and reality. Expectations are not passive predictions — they actively sha...
_Formula:_ Two-way feedback: Reality R(t+1) = f(R(t), Beliefs(t)). Beliefs B(t+1) = g(R(t), B(t)). Self-fulfilling prophecy: B → R → confirms B → reinforces R.

**AXM-092: Antifragility** → _Recipes: E1, E2; Techniques: T14_
Some systems benefit from shocks, volatility, and stressors — they get stronger when exposed to disorder, up to a point. Antifragility is beyond resilience (which merely resists shocks): the system po...
_Formula:_ If performance P is a function of volatility V: fragile system has d²P/dV² < 0 (concave, harmed by volatility), antifragile has d²P/dV² > 0 (convex, g...

**AXM-116: Iceberg Model (Systems Thinking)** → _Recipes: A4_
Visible events are the tip of the iceberg. Below the surface: patterns of behavior (trends over time), systemic structures (feedback loops, incentives, constraints) that produce the patterns, and ment...
_Formula:_ Effectiveness of intervention E = f(depth_of_intervention). Events level: E is low, reactive. Pattern level: E is moderate, adaptive. Structure level:...

**AXM-117: Success to the Successful Archetype** → _Recipes: B4, B5, E4_
When two entities compete for a shared pool of resources, initial advantage leads to more resources, which leads to more advantage, in a reinforcing loop. The initial winner increasingly dominates not...
_Formula:_ Resource allocation R_A(t+1) = R_A(t) + α·(Performance_A - Performance_B). Performance_A = f(R_A). Self-reinforcing: R_A ↑ → Performance_A ↑ → R_A ↑↑....

**AXM-118: Fixes that Fail Archetype** → _Recipes: A2, A3, C4, E3_
A quick fix addresses the symptom but creates unintended consequences that, after a delay, make the original problem worse. The delay between fix and consequence means the connection is not obvious, l...
_Formula:_ At t₀: Problem P. Fix F reduces P immediately. At t₀+delay: F causes side effect S. S increases P by more than F reduced it. Net: P(t₀+delay) > P(t₀)....

**AXM-119: Eroding Goals Archetype** → _Recipes: A2, C4, E3_
When performance falls short of a goal, instead of taking corrective action, the goal is lowered to match performance. Over time, standards erode to the point of mediocrity. The gap between performanc...
_Formula:_ Gap = Goal(t) - Performance(t). Corrective action: increase Performance. Eroding goals: decrease Goal(t+1) = Goal(t) - α·Gap. Over time: Goal → Perfor...

**AXM-120: Growth and Underinvestment Archetype** → _Recipes: A4_
Growth approaches a limit that can be eliminated through investment in capacity. But the investment is not made because the growth is slowing (which reduces urgency) or because the investment is perce...
_Formula:_ Growth rate g = g_potential × (Capacity - Demand)/Capacity. As Demand → Capacity, g → 0. Investment I in new capacity would raise Capacity, but I is t...

**AXM-130: Natural Selection / Evolution as Algorithm** → _Reference only (not in active recipes)_
Whenever you have variation, selection, and retention in a system, evolution operates. This applies to biological organisms, business models, technologies, ideas, and organizational practices. The alg...
_Formula:_ Fitness landscape F(x) over trait space x. Population evolves toward local optima of F through: variation (mutation, recombination), selection (differ...

**AXM-131: Activation Energy / Catalysts** → _Recipes: A2, A3, B3, B4, E2; Techniques: T14_
Some transitions require an initial energy investment (activation energy) even if the end state is lower energy (more favorable). Without a catalyst to lower the activation energy, favorable transitio...
_Formula:_ Transition from state A to state B requires overcoming barrier E_a even if E(B) < E(A). Rate of transition ∝ e^(-E_a/kT). A catalyst reduces E_a witho...

**AXM-134: Accumulation of Marginal Gains (Aggregation of Small Edges)** → _Reference only (not in active recipes)_
Improving many small factors by a small percentage each can produce dramatic overall improvement because the gains compound multiplicatively, not additively. Conversely, many small inefficiencies comp...
_Formula:_ Overall improvement = Π(1 + δᵢ) for n small improvements δᵢ. If δ = 1% across 100 factors: (1.01)^100 = 2.7x improvement. The multiplicative nature me...

**AXM-135: Entropy (In Systems and Organizations)** → _Recipes: E3_
All systems tend toward disorder over time unless energy is actively invested to maintain order. In organizations: processes degrade, alignment erodes, and technical debt accumulates unless deliberate...
_Formula:_ Second Law of Thermodynamics: ΔS_universe ≥ 0. In organizations: Order(t+1) = Order(t) - entropy_rate + maintenance_effort. If maintenance < entropy: ...

**AXM-136: Observer Effect / Heisenberg (Social)** → _Recipes: B5, C3_
The act of measuring or observing a system changes the system's behavior. In social systems: people behave differently when they know they are being watched, measured, or evaluated. What is measured c...
_Formula:_ Observed behavior B_observed = B_natural + Δ(observation). Δ depends on: stakes of observation, visibility, and the observer's perceived power. Relate...

**AXM-139: Niche Construction** → _Recipes: B5, E4_
Organisms do not merely adapt to their environment — they actively modify it, changing the selection pressures that act on themselves and others. In business: companies don't just compete within marke...
_Formula:_ Standard evolution: Environment E selects organisms O. Niche construction: O modifies E to E', which then selects O differently. Co-evolutionary: O(t+...

**AXM-140: Resilience vs. Robustness vs. Antifragility** → _Recipes: E1_
Three distinct responses to stress: Robust systems resist change and maintain performance (rigid but brittle beyond threshold). Resilient systems absorb disruption and recover to original state (flexi...
_Formula:_ Under stress σ: Robust: Performance P = P₀ for σ < threshold, P = 0 for σ > threshold (cliff). Resilient: P drops under σ, returns to P₀ when σ remove...

---

## Organizational Theory (13 entries)

**AXM-001: Brooks' Law** → _Recipes: A2_
Adding manpower to a late software project makes it later. More generally, adding people to a complex coordination task increases communication overhead faster than it increases productive capacity.
_Formula:_ Communication channels = n(n-1)/2 where n = team members. Grows O(n²) while productive capacity grows O(n) at best.

**AXM-011: Conway's Law** → _Recipes: A2_
Organizations which design systems are constrained to produce designs which are copies of the communication structures of those organizations. System architecture mirrors organizational structure.
_Formula:_ No closed-form. The mapping is: if teams A and B must coordinate, the system they build will have an interface between A's component and B's component...

**AXM-040: Modularity Theory** → _Recipes: B2, B4_
A system is modular when it is composed of discrete components (modules) that interact through standardized interfaces. Modularity enables independent development, substitution, and recombination of c...
_Formula:_ Design structure matrix (DSM): dependencies between components are captured in an N×N matrix. Modularity is maximized when the matrix can be block-dia...

**AXM-041: Ringelmann Effect (Social Loafing)** → _Reference only (not in active recipes)_
Individual effort decreases as group size increases. In a group of N people, each person tends to exert less than 1/N of the total possible effort, and this effect increases with group size.
_Formula:_ Individual effort per person ≈ 1/N^α where α > 0 (effort declines faster than the inverse of group size). Total group output < N × individual output.

**AXM-042: Two-Pizza Team Rule (Small Team Advantage)** → _Reference only (not in active recipes)_
Teams small enough to be fed by two pizzas (typically 5–10 people) make faster decisions, have lower coordination overhead, and produce higher-quality output than larger teams for most knowledge work.
_Formula:_ Combines multiple laws: Communication channels = n(n-1)/2 (Brooks), cognitive tracking limit ~7±2 (Miller), social loafing increases with n (Ringelman...

**AXM-043: Alignment Tax (Coordination Cost)** → _Recipes: A2, A3_
The overhead required to ensure all members of a group share the same goals, context, and understanding. This tax increases superlinearly with group size and diversity of perspectives.
_Formula:_ Related to Brooks' Law: alignment meetings scale as O(n²) or O(n·k) where k = number of alignment dimensions. Time spent on alignment = time NOT spent...

**AXM-044: Parkinson's Law** → _Recipes: A2_
Work expands to fill the time available for its completion. More generally, resource consumption expands to consume the resources available.
_Formula:_ No closed-form. The mechanism: without a binding constraint, effort allocation is set by availability rather than requirement. If deadline D is genero...

**AXM-063: Hofstede's Cultural Dimensions** → _Reference only (not in active recipes)_
National and organizational cultures vary along measurable dimensions: Power Distance, Individualism/Collectivism, Masculinity/Femininity, Uncertainty Avoidance, Long/Short-term Orientation, Indulgenc...
_Formula:_ Each dimension scored 0–100 per culture. Interaction effects between dimensions affect outcomes nonlinearly. Cultural distance between two entities = ...

**AXM-075: Peter Principle** → _Recipes: A2_
In a hierarchy, every employee tends to rise to their level of incompetence. People are promoted based on their performance in their current role, which may not predict performance in the next role. E...
_Formula:_ If promotion is based on current-role performance and role requirements change at each level, then after sufficient promotions, performance at new lev...

**AXM-077: Second-System Effect** → _Recipes: C4_
The second system designed by a person or team tends to be over-engineered and over-featured. Having learned from the first system's constraints, designers add all the features they couldn't include b...
_Formula:_ No closed-form. The dynamic: Version 1 features F₁ (constrained). Version 2 features F₂ = F₁ + deferred_features + scope_expansion ≫ F₁. Complexity gr...

**AXM-080: Organizational Debt** → _Recipes: A2, E3_
Analogous to technical debt: organizational debt is the accumulated cost of suboptimal organizational decisions (wrong roles, unclear ownership, poor processes) that were expedient in the short term b...
_Formula:_ Total cost = Direct cost + Org_debt_service. Org_debt_service grows as: unresolved_issues × interaction_frequency × people_affected. Like financial de...

**AXM-085: Parkinson's Law of Triviality (Bikeshedding)** → _Recipes: A4, D3_
Organizations give disproportionate weight to trivial issues while neglecting complex, important ones. The amount of discussion is inversely proportional to the complexity and importance of the topic,...
_Formula:_ Discussion time D ∝ 1/Complexity. Or: D ∝ number of people who feel qualified to opine, which is inversely related to technical difficulty.

**AXM-133: Overton Window** → _Recipes: A3, B3, D3_
At any time, only a narrow range of ideas and policies are considered politically or socially acceptable. Ideas outside this window are dismissed regardless of merit. The window shifts over time, maki...
_Formula:_ For any idea I: P(adoption|I) = f(position_in_window). If I is in the 'acceptable' range, P is moderate. If I is 'popular/policy,' P is high. If I is ...

---

## Game Theory (7 entries)

**AXM-026: Nash Equilibrium** → _Recipes: B3, C4_
A state where no player can improve their outcome by unilaterally changing their strategy, given the strategies of all other players. Each player's strategy is the best response to the others' strateg...
_Formula:_ Strategy profile s* = (s₁*, s₂*, ... sₙ*) where for each player i: uᵢ(sᵢ*, s₋ᵢ*) ≥ uᵢ(sᵢ, s₋ᵢ\*) for all alternative strategies sᵢ.

**AXM-027: Prisoner's Dilemma** → _Recipes: A3, B3_
A situation where individually rational behavior leads to a collectively suboptimal outcome. Each player has an incentive to defect regardless of the other's choice, but mutual cooperation would make ...
_Formula:_ Payoff matrix: Mutual cooperation (R,R) > Mutual defection (P,P), but defecting is dominant: T > R and P > S. So (Defect, Defect) is the Nash equilibr...

**AXM-028: Schelling Focal Point** → _Recipes: A3, B4, D3_
When multiple equilibria exist and players cannot communicate, they tend to converge on solutions that are prominent, salient, or 'natural' in the context — focal points that stand out due to cultural...
_Formula:_ No closed-form. Among equilibria {e₁, e₂, ... eₙ}, the one with highest salience in the shared context is selected with disproportionate probability.

**AXM-029: Winner's Curse** → _Reference only (not in active recipes)_
In competitive bidding, the winner tends to have overpaid. The winning bid is likely the highest estimate of value, which in the presence of uncertainty is likely to be an overestimate.
_Formula:_ If true value V and bidder estimates vᵢ = V + εᵢ (εᵢ = noise), the maximum bid max(vᵢ) is biased upward. Expected overpayment increases with number of...

**AXM-030: Tragedy of the Commons** → _Recipes: A3_
When a shared resource is non-excludable, individual incentives to overexploit exceed collective incentives to conserve, leading to depletion or degradation of the resource.
_Formula:_ Individual benefit of additional extraction B(1) > individual share of collective cost C(1)/N. As N grows, individual cost share shrinks, increasing e...

**AXM-078: Arrow's Impossibility Theorem** → _Recipes: D3_
No voting system can simultaneously satisfy all of: unrestricted domain, non-dictatorship, Pareto efficiency, and independence of irrelevant alternatives when aggregating individual preferences into a...
_Formula:_ No social welfare function f: L(A)^N → L(A) satisfies all four conditions simultaneously when |A| ≥ 3, where A = alternatives, N = voters, L = ranking...

**AXM-089: Keynesian Beauty Contest** → _Recipes: B3_
In situations where outcomes depend on predicting what others will do (not what is objectively best), rational behavior is to anticipate others' predictions rather than optimize for ground truth. This...
_Formula:_ Optimal strategy: choose not what you think is best, but what you think the average person thinks is best (or what the average person thinks the avera...

---

## Information Theory (9 entries)

**AXM-007: Amdahl's Law** → _Recipes: A4; Techniques: T08_
The overall speedup of a system from improving one component is limited by the fraction of time that component is actually used. Parallelization is bounded by the sequential fraction of the task.
_Formula:_ Speedup S(n) = 1 / ((1-p) + p/n) where p = parallelizable fraction, n = number of processors. As n → ∞, S → 1/(1-p).

**AXM-008: Gustafson's Law** → _Reference only (not in active recipes)_
The problem size can scale with the number of processors. Unlike Amdahl's Law (fixed problem size), Gustafson's Law states that larger systems enable tackling larger problems, where the parallelizable...
_Formula:_ Scaled speedup S(n) = n - α(n-1) where α = serial fraction. As n grows, the problem grows with it.

**AXM-009: Shannon's Channel Capacity Theorem** → _Reference only (not in active recipes)_
Every communication channel has a maximum rate at which information can be reliably transmitted (channel capacity). Attempting to transmit above this rate inevitably introduces errors.
_Formula:_ C = B · log₂(1 + S/N) where C = channel capacity (bits/sec), B = bandwidth, S/N = signal-to-noise ratio.

**AXM-070: Curse of Dimensionality** → _Reference only (not in active recipes)_
As the number of dimensions (variables) increases, the volume of the space increases exponentially, making data sparse and distances between points increasingly similar. Methods that work in low dimen...
_Formula:_ Volume of d-dimensional unit hypersphere → 0 as d → ∞. The ratio of nearest-neighbor to farthest-neighbor distance → 1 as d → ∞. Data needed to mainta...

**AXM-079: Gilder's Law (Bandwidth)** → _Reference only (not in active recipes)_
Total bandwidth of communication systems triples every twelve months, growing at least three times faster than computing power.
_Formula:_ Bandwidth B(t) ≈ B(0) · 3^(t/12months). Combined with Moore's Law (computing doubles every ~18-24 months) → bandwidth grows faster than compute.

**AXM-082: Law of Large Numbers (Statistical Convergence)** → _Recipes: C2, D2; Techniques: T06_
As sample size increases, the sample average converges to the expected value. Small samples are unreliable indicators of true underlying rates.
_Formula:_ For i.i.d. random variables with mean μ: P(|X̄_n - μ| > ε) → 0 as n → ∞ for any ε > 0.

**AXM-083: Bayes' Theorem (Belief Updating)** → _Recipes: C1, D2; Techniques: T06_
The rational way to update beliefs given new evidence. The posterior probability of a hypothesis is proportional to the prior probability multiplied by the likelihood of the evidence given the hypothe...
_Formula:_ P(H|E) = P(E|H) · P(H) / P(E). In odds form: Posterior odds = Prior odds × Likelihood ratio.

**AXM-122: Premature Optimization** → _Recipes: A4; Techniques: T08_
Optimizing a component before the overall system design is settled wastes effort and creates constraints that prevent better global solutions. Local optimization before global understanding leads to g...
_Formula:_ Local optimum ≠ Global optimum in non-convex landscapes. Optimizing component C₁ early locks in constraints that may prevent reaching the global optim...

**AXM-129: Falsifiability (Popper)** → _Recipes: C1, D2; Techniques: T03, T06_
A claim is meaningful and testable only if there exists an observation that could prove it wrong. Unfalsifiable claims (true regardless of evidence) are not useful for decision-making because they can...
_Formula:_ Claim C is falsifiable if ∃ observation O such that P(O|C) ≈ 0. If no such O exists, C is unfalsifiable and carries no predictive content. Bayesian: u...

---

# Appendix: Agent Routing Guide

Which recipes does each Oracle agent need?

**Consistency Checker:** C2 (Is this extreme outcome plausible?)

**Decomposer:** A1 (Why is this market structured this way?), A2 (Why does this organization behave this way?), A3 (Why hasn't this obvious improvement happened?), A4 (What is the binding constraint?)

**Equilibrium Analyst:** B2 (What happens when this gets cheaper/faster/easier?), B3 (How will actors respond to this change?), B5 (What feedback loops are at play?), C4 (Will this intervention backfire?), E4 (How will the competitive landscape reshape?)

**Expert Council synthesis:** D3 (Is this consensus real or manufactured?)

**Impact Assessor:** B1 (Where is this trend heading?), B4 (Will this adoption succeed or stall?)

**Red Team:** A2 (Why does this organization behave this way?), A3 (Why hasn't this obvious improvement happened?), C1 (What would make this scenario impossible?), C2 (Is this extreme outcome plausible?), C3 (What are we not seeing?), C4 (Will this intervention backfire?), D2 (Are we confusing good story with good evidence?), E3 (What should we stop doing?)

**Rubric Evaluator:** D1 (Is this estimate anchored or calibrated?), D4 (What's the right confidence level for this type of claim?)

**Scanner:** B1 (Where is this trend heading?), B2 (What happens when this gets cheaper/faster/easier?), B4 (Will this adoption succeed or stall?)

**Scenario Developer:** B2 (What happens when this gets cheaper/faster/easier?), B3 (How will actors respond to this change?), B4 (Will this adoption succeed or stall?), E1 (What are the no-regret moves?), E2 (Where are the options to buy?), E3 (What should we stop doing?), E4 (How will the competitive landscape reshape?)

**Systems Mapper:** A1 (Why is this market structured this way?), B5 (What feedback loops are at play?)

**Verifier:** A3 (Why hasn't this obvious improvement happened?), A4 (What is the binding constraint?), D1 (Is this estimate anchored or calibrated?), D2 (Are we confusing good story with good evidence?), D4 (What's the right confidence level for this type of claim?)

**Weak Signal Hunter:** C3 (What are we not seeing?)

---

# Appendix: Phase Routing Guide

Which recipes are active in each Oracle phase?

**Phase 1:** A1 (Why is this market structured this way?), A2 (Why does this organization behave this way?), A3 (Why hasn't this obvious improvement happened?), A4 (What is the binding constraint?), B5 (What feedback loops are at play?), C3 (What are we not seeing?), D1 (Is this estimate anchored or calibrated?), D3 (Is this consensus real or manufactured?), D4 (What's the right confidence level for this type of claim?)

**Phase 2:** A1 (Why is this market structured this way?), A3 (Why hasn't this obvious improvement happened?), B1 (Where is this trend heading?), B2 (What happens when this gets cheaper/faster/easier?), B4 (Will this adoption succeed or stall?), C3 (What are we not seeing?), D1 (Is this estimate anchored or calibrated?), D3 (Is this consensus real or manufactured?), D4 (What's the right confidence level for this type of claim?)

**Phase 3:** A2 (Why does this organization behave this way?), A4 (What is the binding constraint?), B2 (What happens when this gets cheaper/faster/easier?), B3 (How will actors respond to this change?), B4 (Will this adoption succeed or stall?), B5 (What feedback loops are at play?), C1 (What would make this scenario impossible?), C2 (Is this extreme outcome plausible?), C3 (What are we not seeing?), C4 (Will this intervention backfire?), D1 (Is this estimate anchored or calibrated?), D2 (Are we confusing good story with good evidence?), D3 (Is this consensus real or manufactured?), D4 (What's the right confidence level for this type of claim?), E1 (What are the no-regret moves?), E2 (Where are the options to buy?), E3 (What should we stop doing?), E4 (How will the competitive landscape reshape?)
