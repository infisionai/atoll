import type { Preview } from '@storybook/react-vite'
import '../src/shared/global.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      options: {
        canvas: { name: 'canvas', value: '#0c1519' },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'canvas' },
  },
}

export default preview
