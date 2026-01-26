export type ContentTypePreset = {
  id: string
  name: string
  tone: string
  length: string
  focus: string
}

export const contentTypePresets: ContentTypePreset[] = [
  {
    id: 'professional-thought-leadership',
    name: 'Professional Thought Leadership',
    tone: 'Balanced and authoritative',
    length: '1000-1500 words',
    focus: 'Industry insights and best practices',
  },
  {
    id: 'technical-deep-dive',
    name: 'Technical Deep-Dive',
    tone: 'Detailed and technical',
    length: '1500-2500 words',
    focus: 'Code examples, architecture, implementation details',
  },
  {
    id: 'executive-summary',
    name: 'Executive Summary',
    tone: 'Concise and high-level',
    length: '500-800 words',
    focus: 'Strategic insights and business impact',
  },
  {
    id: 'educational-tutorial',
    name: 'Educational Tutorial',
    tone: 'Step-by-step and beginner-friendly',
    length: '1200-2000 words',
    focus: 'How-to guides with practical examples',
  },
  {
    id: 'opinion-commentary',
    name: 'Opinion/Commentary',
    tone: 'Personal and provocative',
    length: '800-1200 words',
    focus: 'Hot takes and contrarian views',
  },
]
