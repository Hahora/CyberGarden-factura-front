import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const zip = process.argv[2]
if (!zip) {
  console.error('Укажите путь к архиву: node scripts/fetch-corpus.mjs Кейс5_область1_участникам.zip')
  process.exit(1)
}
const out = resolve('public/corpus')
for (const d of ['dev', 'test']) mkdirSync(resolve(out, d), { recursive: true })
const py = `
import zipfile, sys, os
z = zipfile.ZipFile(sys.argv[1]); out = sys.argv[2]; n = 0
for i in z.infolist():
    f = i.filename
    for d in ('dev', 'test'):
        if f.startswith(d + '/') and f.endswith('.pdf'):
            open(os.path.join(out, d, os.path.basename(f)), 'wb').write(z.read(i)); n += 1
print('PDF:', n)
`
execFileSync('python', ['-I', '-c', py, resolve(zip), out], { stdio: 'inherit' })
