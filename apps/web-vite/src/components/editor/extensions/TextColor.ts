/**
 * TextColor Extension
 *
 * Adds color attribute support to the TextStyle mark.
 */

import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      /**
       * Set the text color
       */
      setTextColor: (color: string) => ReturnType
      /**
       * Clear the text color
       */
      unsetTextColor: () => ReturnType
    }
  }
}

export const TextColor = Extension.create({
  name: 'textColor',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          color: {
            default: null,
            parseHTML: (element) => element.style.color?.replace(/['"]/g, ''),
            renderHTML: (attributes) => {
              if (!attributes.color) {
                return {}
              }
              return {
                style: `color: ${attributes.color}`,
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setTextColor:
        (color: string) =>
        ({ chain }) => {
          return chain().setMark('textStyle', { color }).run()
        },
      unsetTextColor:
        () =>
        ({ chain }) => {
          return chain().setMark('textStyle', { color: null }).removeEmptyTextStyle().run()
        },
    }
  },
})
