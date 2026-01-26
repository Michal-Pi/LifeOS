import { randomUUID } from 'crypto'
import type { AgentConfig, DeepResearchRequest } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { ANTHROPIC_API_KEY, OPENAI_API_KEY, loadProviderKeys } from './providerKeys.js'
import { executeWithProvider } from './providerService.js'

const buildSynthesisPrompt = (request: DeepResearchRequest): string => {
  const results = request.results ?? []
  return [
    'You are synthesizing research from multiple AI models.',
    `RESEARCH TOPIC: ${request.topic}`,
    'QUESTIONS:',
    request.questions.map((question, index) => `${index + 1}. ${question}`).join('\n'),
    'RESEARCH RESULTS:',
    results
      .map(
        (result, index) =>
          `SOURCE ${index + 1}: ${result.source} (${result.model})\n${result.content.trim()}`
      )
      .join('\n---\n'),
    '',
    'Synthesize these findings into a comprehensive summary that:',
    '1. Combines complementary insights',
    '2. Resolves contradictions (note disagreements if unresolvable)',
    '3. Highlights consensus views',
    '4. Notes areas of disagreement',
    '5. Provides actionable recommendations',
    'Structure with clear sections for each question. Use markdown.',
  ].join('\n')
}

const fallbackSynthesis = (request: DeepResearchRequest): string => {
  const results = request.results ?? []
  if (results.length === 0) {
    throw new Error('No research results to synthesize')
  }
  if (results.length === 1) {
    return results[0].content
  }

  const summaryHeader = `SYNTHESIZED FINDINGS: ${request.topic}`
  const combined = results
    .map(
      (result, index) =>
        `SOURCE ${index + 1}: ${result.source} (${result.model})\n${result.content.trim()}`
    )
    .join('\n\n---\n\n')

  return `${summaryHeader}\n\n${combined}`
}

const buildSynthesisAgent = (
  userId: string,
  provider: 'openai' | 'anthropic'
): AgentConfig => {
  const now = Date.now()
  const agentId = `agent:research-synthesis:${randomUUID()}`
  const modelName = provider === 'anthropic' ? 'claude-3-opus-20240229' : 'gpt-4o'
  return {
    agentId: agentId as AgentConfig['agentId'],
    userId,
    name: 'Research Synthesis',
    role: 'synthesizer',
    systemPrompt: 'You synthesize multi-source research into actionable summaries.',
    modelProvider: provider,
    modelName,
    temperature: 0.2,
    toolIds: [],
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    syncState: 'synced',
    version: 1,
  }
}

export const synthesizeResearch = onCall(
  { secrets: [OPENAI_API_KEY, ANTHROPIC_API_KEY] },
  async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required.')
  }

  const { requestId } = request.data as { requestId?: string }
  if (!requestId) {
    throw new HttpsError('invalid-argument', 'requestId is required.')
  }

  const db = getFirestore()
  const snapshot = await db
    .collectionGroup('deepResearchRequests')
    .where('requestId', '==', requestId)
    .where('userId', '==', request.auth.uid)
    .limit(1)
    .get()

  if (snapshot.empty) {
    throw new HttpsError('not-found', 'Research request not found.')
  }

  const docRef = snapshot.docs[0].ref
  const researchRequest = snapshot.docs[0].data() as DeepResearchRequest
  const results = researchRequest.results ?? []
  if (results.length === 0) {
    throw new HttpsError('failed-precondition', 'No research results to synthesize.')
  }

  let synthesizedFindings = ''
  try {
    const apiKeys = await loadProviderKeys(request.auth.uid)
    const provider = apiKeys.anthropic ? 'anthropic' : apiKeys.openai ? 'openai' : null
    if (!provider) {
      throw new Error('No synthesis provider configured')
    }
    const agent = buildSynthesisAgent(request.auth.uid, provider)
    const prompt = buildSynthesisPrompt(researchRequest)
    const result = await executeWithProvider(agent, prompt, undefined, apiKeys)
    synthesizedFindings = result.output.trim()
  } catch (error) {
    console.error('AI synthesis failed, falling back to concatenation:', error)
    synthesizedFindings = fallbackSynthesis(researchRequest)
  }

  await docRef.update({
    synthesizedFindings,
    status: 'completed',
    integratedAtMs: Date.now(),
  })

  return { synthesizedFindings }
  }
)
