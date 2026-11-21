import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GOLD = path.join(ROOT, 'data/solar')
const PORT = Number(process.env.PORT || 8000)
const BASE = '/api/v1'
const TABLES = ['publications', 'materials', 'devices', 'layers', 'measurements', 'results', 'issues']

function parseCsv(text) {
  text = text.replace(/^﻿/, '')
  const rows = []
  let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  const head = rows.shift()
  return { head, rows: rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) }
}
const T = {}
const COLS = {}
for (const n of TABLES) {
  const { head, rows } = parseCsv(fs.readFileSync(path.join(GOLD, n + '.csv'), 'utf8'))
  T[n] = rows
  COLS[n] = head
}
const pubOf = (pid) => T.publications.find((p) => p.publication_id === pid)
const rowsOf = (n, pid) => T[n].filter((r) => r.publication_id === pid)
const SCORED = ['PCE', 'Voc', 'Jsc', 'FF', 'Rs', 'Rsh', 'HI', 'Jsc_EQE', 'stabilized_PCE', 'T80', 'retained_PCE']

const sessions = new Set()
const runs = []
let seq = 1
const token = () => 'tok_' + Math.random().toString(36).slice(2)
const iso = (t) => new Date(t).toISOString().replace(/\.\d+Z$/, 'Z')

function fileState(run, f, now) {
  const t = now - run.t0 - f.idx * 700
  if (t < 0) return { status: 'queued', progress: 0 }
  if (t < 2500) return { status: 'running', progress: Math.min(99, Math.round((t / 2500) * 100)), stage: t < 900 ? 'Извлечение' : t < 1800 ? 'Нормализация' : 'Проверка' }
  const pub = pubOf(f.id)
  if (!pub) return { status: 'nodata', progress: 100 }
  if (pub.in_scope === 'false') return { status: 'out', progress: 100, reason: pub.exclusion_reason || 'не по теме' }
  return { status: 'done', progress: 100 }
}
const LABEL = { queued: 'в очереди', running: 'разбор', done: 'готово', nodata: 'нет результатов', error: 'ошибка' }
function view(run, short) {
  const now = Date.now()
  const files = run.files.map((f) => {
    const s = fileState(run, f, now)
    const has = s.status === 'done'
    return { id: f.id, name: f.name, ...s, status_label: s.status === 'out' ? s.reason : LABEL[s.status], has_data: has, results: has ? rowsOf('results', f.id).length : 0, issues: has ? rowsOf('issues', f.id).length : 0, reason: s.reason ?? null }
  })
  const c = { files: files.length, queued: 0, running: 0, done: 0, out: 0, error: 0, nodata: 0 }
  for (const f of files) c[f.status]++
  const status = c.queued || c.running ? (c.running || c.done || c.out ? 'running' : 'queued') : 'done'
  return {
    id: run.id, title: run.title, domain: 'solar', status, created_at: iso(run.t0), updated_at: iso(now), counts: c,
    results: files.reduce((a, f) => a + f.results, 0), issues: files.reduce((a, f) => a + f.issues, 0),
    files: short ? files.map(({ id, name, status: s, has_data, results, issues, reason }) => ({ id, name, status: s, has_data, results, issues, reason })) : files,
  }
}

function parseMultipart(buf, ct) {
  const b = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct)
  const bd = Buffer.from('--' + (b?.[1] ?? b?.[2]))
  const parts = []
  let pos = buf.indexOf(bd)
  while (pos >= 0) {
    const next = buf.indexOf(bd, pos + bd.length)
    if (next < 0) break
    const chunk = buf.subarray(pos + bd.length + 2, next - 2)
    const he = chunk.indexOf('\r\n\r\n')
    const head = chunk.subarray(0, he).toString('utf8')
    const name = /name="([^"]*)"/.exec(head)?.[1]
    const filename = /filename="([^"]*)"/.exec(head)?.[1]
    parts.push({ name, filename, data: chunk.subarray(he + 4) })
    pos = next
  }
  return parts
}

function zip(files) {
  const out = [], cd = []
  let off = 0
  for (const f of files) {
    const name = Buffer.from(f.name), data = Buffer.from(f.data), crc = zlib.crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6)
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26)
    out.push(lh, name, data)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8)
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42)
    cd.push(ch, name)
    off += 30 + name.length + data.length
  }
  const cdb = Buffer.concat(cd)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdb.length, 12); end.writeUInt32LE(off, 16)
  return Buffer.concat([...out, cdb, end])
}
const csvQ = (s) => (/[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)
const csv = (cols, rows) => '﻿' + [cols, ...rows.map((r) => cols.map((c) => r[c] ?? ''))].map((r) => r.map(csvQ).join(',')).join('\r\n') + '\r\n'

const send = (res, code, body, headers = {}) => {
  const json = body !== undefined && !Buffer.isBuffer(body)
  res.writeHead(code, { ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers })
  res.end(json ? JSON.stringify(body) : body)
}
const fail = (res, code, errCode, message) => send(res, code, { error: { code: errCode, message, field: null, details: null, request_id: 'mock' } })
const authed = (req) => sessions.has((req.headers.authorization ?? '').replace(/^Bearer /, ''))
const readBody = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))) })
const USER = { id: 'u_1', user_id: 'u_1', email: 'admin@faktura.local', name: 'Админ', role: null, team: null, color: '#2f6bff', focus: null, is_admin: true }

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : null
  if (p === null) return fail(res, 404, 'not_found', 'Не найдено')
  const m = req.method
  try {
    if (p === '/health') return send(res, 200, { status: 'ok' })
    if (p === '/auth/login' && m === 'POST') {
      const b = JSON.parse((await readBody(req)).toString() || '{}')
      if (b.email !== 'admin@faktura.local' || b.password !== 'admin') return fail(res, 401, 'invalid_credentials', 'Неверная почта или пароль')
      const t = token(); sessions.add(t)
      return send(res, 200, { access_token: t, token_type: 'Bearer', expires_in: 900, user: USER }, { 'Set-Cookie': 'refresh=ok; HttpOnly; Path=/; SameSite=Lax' })
    }
    if (p === '/auth/refresh' && m === 'POST') {
      if (!/refresh=ok/.test(req.headers.cookie ?? '')) return fail(res, 401, 'unauthorized', 'Нужно войти')
      const t = token(); sessions.add(t)
      return send(res, 200, { access_token: t, token_type: 'Bearer', expires_in: 900 })
    }
    if (p === '/auth/logout' && m === 'POST') return send(res, 204, undefined, { 'Set-Cookie': 'refresh=; Max-Age=0; Path=/' })
    if (!authed(req)) return fail(res, 401, 'unauthorized', 'Нужно войти')
    if (p === '/auth/me') return send(res, 200, USER)

    if (p === '/runs' && m === 'POST') {
      const parts = parseMultipart(await readBody(req), req.headers['content-type'] ?? '')
      const files = [], rejected = []
      const seen = new Set()
      let title = parts.find((x) => x.name === 'title')?.data.toString()
      const archive = parts.find((x) => x.name === 'archive')
      if (archive) { for (const pb of T.publications) files.push({ id: pb.publication_id, name: pb.publication_id + '.pdf' }); title ||= archive.filename?.replace(/\.zip$/i, '') }
      for (const x of parts.filter((y) => y.name === 'file')) {
        const base = x.filename.split('/').pop()
        if (!/\.pdf$/i.test(base)) { rejected.push({ name: x.filename, code: 'unsupported_file', message: 'Можно загрузить только PDF' }); continue }
        const id = base.replace(/\.pdf$/i, '')
        if (seen.has(id)) { rejected.push({ name: x.filename, code: 'duplicate', message: 'Такой файл уже есть в разборе' }); continue }
        seen.add(id); files.push({ id, name: x.filename })
      }
      if (!files.length) return fail(res, 400, 'no_files', 'Не нашлось ни одного PDF')
      files.forEach((f, i) => (f.idx = i))
      const run = { id: 'run_' + seq++, title: title || `${files.length} ${files.length === 1 ? 'статья' : 'статей'} · ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`, t0: Date.now(), files }
      runs.unshift(run)
      return send(res, 202, { ...view(run), rejected })
    }
    if (p === '/runs') return send(res, 200, { data: runs.map((r) => view(r, true)), next_cursor: null })
    let mm = /^\/runs\/([^/]+)(\/summary|\/submission\.zip)?$/.exec(p)
    if (mm) {
      const run = runs.find((r) => r.id === mm[1])
      if (!run) return fail(res, 404, 'not_found', 'Разбор не найден')
      const v = view(run)
      if (!mm[2]) return send(res, 200, v)
      const done = v.files.filter((f) => f.status === 'done')
      if (mm[2] === '/summary') {
        const n = (metric) => done.filter((f) => rowsOf('results', f.id).some((r) => r.metric_name === metric && r.extraction_status === 'extracted')).length
        const by = {}
        for (const f of done) for (const i of rowsOf('issues', f.id)) by[i.check_name] = (by[i.check_name] ?? 0) + 1
        return send(res, 200, {
          files: v.counts.files, papers_in_scope: v.counts.done, papers_out: v.counts.out, files_without_results: v.counts.nodata, files_error: v.counts.error,
          results: v.results, scored_results: done.reduce((a, f) => a + rowsOf('results', f.id).filter((r) => SCORED.includes(r.metric_name)).length, 0), issues_total: v.issues,
          coverage: SCORED.map((metric) => ({ metric, n: n(metric), total: done.length, results: 0 })),
          issues_by_check: Object.entries(by).map(([check_name, total]) => ({ check_name, total })).sort((a, b) => b.total - a.total),
        })
      }
      if (v.status !== 'done' && url.searchParams.get('partial') !== 'true') return fail(res, 409, 'run_in_progress', 'Разбор ещё идёт')
      const ids = v.files.filter((f) => ['done', 'out'].includes(f.status)).map((f) => f.id)
      const files = TABLES.map((n) => ({ name: n + '.csv', data: csv(COLS[n], ids.flatMap((id) => (n === 'publications' ? T[n].filter((r) => r.publication_id === id) : pubOf(id)?.in_scope === 'false' ? [] : rowsOf(n, id)))) }))
      const name = encodeURIComponent(`Набор — ${run.title}.zip`)
      return send(res, 200, zip(files), {
        'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename*=UTF-8''${name}`,
        'X-Export-Tables': '7', 'X-Export-Results': String(ids.reduce((a, id) => a + rowsOf('results', id).length, 0)), 'X-Export-Papers': String(ids.length), 'X-Export-Filename': name,
      })
    }
    mm = /^\/papers\/solar\/([^/]+)(\/pdf)?$/.exec(p)
    if (mm) {
      const pid = decodeURIComponent(mm[1])
      if (mm[2]) {
        const f = path.join(ROOT, 'public/corpus/dev', pid + '.pdf')
        if (!fs.existsSync(f)) return fail(res, 404, 'not_found', 'Файл не найден')
        const size = fs.statSync(f).size
        const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
        if (r) {
          const a = r[1] ? +r[1] : 0, b = r[2] ? Math.min(+r[2], size - 1) : size - 1
          res.writeHead(206, { 'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 })
          return fs.createReadStream(f, { start: a, end: b }).pipe(res)
        }
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes', 'Content-Length': size })
        return fs.createReadStream(f).pipe(res)
      }
      const pub = pubOf(pid)
      if (!pub) return fail(res, 404, 'not_found', 'Статья не найдена')
      const out = pub.in_scope === 'false'
      const o = { publication: pub }
      for (const n of TABLES.slice(1)) o[n] = out ? [] : rowsOf(n, pid)
      const results = {}
      for (const r of o.results) {
        const ids = o.issues.filter((i) => i.record_ids.split(';').includes(r.result_id)).map((i) => i.issue_id)
        results[r.result_id] = { quote_found: r.source_fragment !== '', issue_ids: ids, duplicates: o.results.filter((x) => x.duplicate_of === r.result_id).map((x) => x.result_id) }
      }
      return send(res, 200, { ...o, paper_status: out ? 'out' : 'has_data', meta: { file_status: out ? 'out' : 'done', run_ids: runs.map((r) => r.id), pdf_pages: 9, results } })
    }
    return fail(res, 404, 'not_found', 'Не найдено')
  } catch (e) {
    console.error(e)
    return fail(res, 500, 'internal', 'Внутренняя ошибка')
  }
}).listen(PORT, () => console.log(`mock-api: http://localhost:${PORT}${BASE}  (admin@faktura.local / admin)`))
