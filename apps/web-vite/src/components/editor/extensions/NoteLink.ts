/**
 * Note Link Extension
 *
 * Custom TipTap extension for note-to-note links.
 * Extends Link mark to support note:// protocol and wiki-style [[Note Title]] links.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Note } from '@lifeos/notes'

export interface NoteLinkOptions {
  availableNotes?: Note[]
  onNoteClick?: (noteId: string) => void
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteLink: {
      /**
       * Set a note link
       */
      setNoteLink: (attributes: { href: string; noteId?: string }) => ReturnType
      /**
       * Toggle a note link
       */
      toggleNoteLink: (attributes: { href: string; noteId?: string }) => ReturnType
    }
  }
}

export const NoteLink = Extension.create<NoteLinkOptions>({
  name: 'noteLink',

  addOptions() {
    return {
      availableNotes: [],
      onNoteClick: undefined,
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: ['link'],
        attributes: {
          noteId: {
            default: null,
            parseHTML: (element) => {
              const href = element.getAttribute('href')
              if (href && href.startsWith('note://')) {
                return href.replace('note://', '')
              }
              return null
            },
            renderHTML: (attributes) => {
              if (!attributes.noteId) {
                return {}
              }
              return {
                'data-note-id': attributes.noteId,
                class: 'note-link',
              }
            },
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    const { onNoteClick } = this.options

    return [
      new Plugin({
        key: new PluginKey('noteLinkClickHandler'),
        props: {
          handleClick: (view: EditorView, pos: number, event: MouseEvent) => {
            try {
              const { state } = view
              const { schema } = state
              const { marks } = schema

              const linkMark = marks.link
              if (!linkMark) return false

              const $pos = state.doc.resolve(pos)
              const mark = linkMark.isInSet($pos.marks())

              if (mark && mark.attrs?.href) {
                const href = mark.attrs.href as string
                if (href.startsWith('note://')) {
                  event.preventDefault()
                  const noteId = href.replace('note://', '')
                  if (onNoteClick && noteId) {
                    onNoteClick(noteId)
                  }
                  return true
                }
              }

              // Also check for link in the DOM
              const target = event.target as HTMLElement
              const linkElement = target.closest('a')
              if (linkElement) {
                const href = linkElement.getAttribute('href')
                if (href && href.startsWith('note://')) {
                  event.preventDefault()
                  const noteId = href.replace('note://', '')
                  if (onNoteClick && noteId) {
                    onNoteClick(noteId)
                  }
                  return true
                }
              }
            } catch (error) {
              console.error('Error handling note link click:', error)
            }

            return false
          },
        },
      }),
    ]
  },

  addCommands() {
    return {
      setNoteLink:
        (attributes) =>
        ({ chain }) => {
          const href = attributes.href || (attributes.noteId ? `note://${attributes.noteId}` : '')
          return chain()
            .setMark('link', { href, noteId: attributes.noteId })
            .setMeta('preventAutofocus', true)
            .run()
        },
      toggleNoteLink:
        (attributes) =>
        ({ chain }) => {
          const href = attributes.href || (attributes.noteId ? `note://${attributes.noteId}` : '')
          return chain()
            .toggleMark('link', { href, noteId: attributes.noteId }, { extendEmptyMarkRange: true })
            .setMeta('preventAutofocus', true)
            .run()
        },
    }
  },
})
