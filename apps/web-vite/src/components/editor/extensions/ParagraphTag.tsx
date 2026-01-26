/**
 * Paragraph Tag Extension
 *
 * Allows tagging paragraphs/sections with notes or topics (like inline tags).
 * Tags are stored as marks on paragraph nodes.
 */

import { Extension } from '@tiptap/core'
import type { Note, TopicId } from '@lifeos/notes'

export interface ParagraphTagOptions {
  availableNotes?: Note[]
  availableTopics?: Array<{ topicId: TopicId; name: string }>
  onTagClick?: (tagType: 'note' | 'topic', id: string) => void
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphTag: {
      /**
       * Tag a paragraph with a note or topic
       */
      setParagraphTag: (attributes: { noteId?: string; topicId?: string }) => ReturnType
      /**
       * Remove paragraph tag
       */
      removeParagraphTag: () => ReturnType
    }
  }
}

export const ParagraphTag = Extension.create<ParagraphTagOptions>({
  name: 'paragraphTag',

  addOptions() {
    return {
      availableNotes: [],
      availableTopics: [],
      onTagClick: undefined,
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          paragraphTagNoteId: {
            default: null,
            parseHTML: (element) => {
              return element.getAttribute('data-paragraph-tag-note-id')
            },
            renderHTML: (attributes) => {
              if (!attributes.paragraphTagNoteId) {
                return {}
              }
              return {
                'data-paragraph-tag-note-id': attributes.paragraphTagNoteId,
                class: 'paragraph-tagged paragraph-tagged-note',
              }
            },
          },
          paragraphTagTopicId: {
            default: null,
            parseHTML: (element) => {
              return element.getAttribute('data-paragraph-tag-topic-id')
            },
            renderHTML: (attributes) => {
              if (!attributes.paragraphTagTopicId) {
                return {}
              }
              return {
                'data-paragraph-tag-topic-id': attributes.paragraphTagTopicId,
                class: 'paragraph-tagged paragraph-tagged-topic',
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setParagraphTag:
        (attributes) =>
        ({ chain, state }) => {
          const { selection } = state
          const { $from } = selection

          // Get the paragraph/heading node
          let node = $from.parent
          let depth = $from.depth

          // Find the paragraph or heading node
          while (depth > 0 && node.type.name !== 'paragraph' && node.type.name !== 'heading') {
            depth--
            node = $from.node(depth)
          }

          if (node.type.name !== 'paragraph' && node.type.name !== 'heading') {
            return false
          }

          const attrs: Record<string, unknown> = {}
          if (attributes.noteId) {
            attrs.paragraphTagNoteId = attributes.noteId
          }
          if (attributes.topicId) {
            attrs.paragraphTagTopicId = attributes.topicId
          }

          // Update the node attributes
          return chain()
            .focus()
            .command(({ tr, state: editorState }) => {
              const { $from: from } = editorState.selection
              let targetDepth = from.depth
              let targetNode = from.parent

              // Find paragraph/heading node
              while (
                targetDepth > 0 &&
                targetNode.type.name !== 'paragraph' &&
                targetNode.type.name !== 'heading'
              ) {
                targetDepth--
                targetNode = from.node(targetDepth)
              }

              if (targetNode.type.name === 'paragraph' || targetNode.type.name === 'heading') {
                // Get the position of the node
                const nodePos = from.start(targetDepth)

                tr.setNodeMarkup(nodePos, undefined, {
                  ...targetNode.attrs,
                  ...attrs,
                })
              }

              return true
            })
            .run()
        },
      removeParagraphTag:
        () =>
        ({ chain, state }) => {
          const { selection } = state
          const { $from } = selection

          let node = $from.parent
          let depth = $from.depth

          while (depth > 0 && node.type.name !== 'paragraph' && node.type.name !== 'heading') {
            depth--
            node = $from.node(depth)
          }

          if (node.type.name !== 'paragraph' && node.type.name !== 'heading') {
            return false
          }

          return chain()
            .focus()
            .command(({ tr, state: editorState }) => {
              const { $from: from } = editorState.selection
              let targetDepth = from.depth
              let targetNode = from.parent

              while (
                targetDepth > 0 &&
                targetNode.type.name !== 'paragraph' &&
                targetNode.type.name !== 'heading'
              ) {
                targetDepth--
                targetNode = from.node(targetDepth)
              }

              if (targetNode.type.name === 'paragraph' || targetNode.type.name === 'heading') {
                // Get the position of the node
                const nodePos = from.start(targetDepth)

                tr.setNodeMarkup(nodePos, undefined, {
                  ...targetNode.attrs,
                  paragraphTagNoteId: null,
                  paragraphTagTopicId: null,
                })
              }

              return true
            })
            .run()
        },
    }
  },
})
