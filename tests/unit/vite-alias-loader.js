import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const aliasRoots = {
  '@pinia/': path.join(root, 'src/pinia/'),
  '@three/': path.join(root, 'src/js/'),
  '@/': path.join(root, 'src/'),
}

export async function resolve(specifier, context, nextResolve) {
  for (const [prefix, targetRoot] of Object.entries(aliasRoots)) {
    if (specifier.startsWith(prefix)) {
      const mapped = pathToFileURL(path.join(targetRoot, specifier.slice(prefix.length))).href
      return nextResolve(mapped, context)
    }
  }

  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  return nextLoad(url, context)
}
