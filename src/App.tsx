import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

type PersianTtsPlugin = { speak(options: { text: string; voiceId: string; speed: number; pitch: number; volume: number }): Promise<void>; stop(): Promise<void> };
const PersianTTS = registerPlugin<PersianTtsPlugin>('PersianTTS');
const bundledPersianVoices = [
  { id: 'amir', name: 'امیر · صدای مردانه' },
  { id: 'gyro', name: 'گیرو · صدای متفاوت' },
  { id: 'ganji', name: 'گنجی · صدای متفاوت' }
];
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import {
  AudioLines, Play, Pause, Square, Plus, Trash2, Users, WandSparkles,
  Volume2, Download, Mic2, Sparkles, CircleHelp, FileJson, FileText,
  Upload, ChevronUp, ChevronDown, RotateCcw, Search, Save, Clock3
} from 'lucide-react';

type Speaker = { id: number; name: string; voiceURI: string; rate: number; pitch: number; tone: string; volume: number };
type Turn = { id: number; speakerId: number; text: string; pauseAfter: number };
type Project = { schema: 'voicecast-project'; version: 1; title: string; mode: string; speakers: Speaker[]; turns: Turn[]; savedAt: string };
const tones = ['روایی', 'حماسی', 'آرام', 'احساسی', 'نمایشی'];
const makeId = () => Date.now() + Math.floor(Math.random() * 100000);
const defaults: Speaker[] = [
  { id: 1, name: 'راوی', voiceURI: 'fa:amir', rate: 0.92, pitch: 1, tone: 'روایی', volume: 1 },
  { id: 2, name: 'شخصیت دوم', voiceURI: 'fa:gyro', rate: 1, pitch: 1.08, tone: 'حماسی', volume: 1 }
];
const sample: Turn[] = [
  { id: 1, speakerId: 1, text: 'به نام خداوند جان و خرد', pauseAfter: 0.5 },
  { id: 2, speakerId: 2, text: 'این داستان، روایت ایستادگی و امید است.', pauseAfter: 0.4 },
  { id: 3, speakerId: 1, text: 'در دل تاریکی، صدایی برخاست و همه را به حرکت فراخواند.', pauseAfter: 0.5 }
];

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>(defaults);
  const [turns, setTurns] = useState<Turn[]>(sample);
  const [rawText, setRawText] = useState('');
  const [title, setTitle] = useState('پروژه بدون عنوان');
  const [mode, setMode] = useState('نمایشی');
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(-1);
  const [notice, setNotice] = useState('متن را وارد کنید یا پروژهٔ نمونه را ویرایش کنید.');
  const [supported, setSupported] = useState(true);
  const [splitRule, setSplitRule] = useState('sentence');
  const [assignRule, setAssignRule] = useState('round');
  const [voiceSearch, setVoiceSearch] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const token = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    if (Capacitor.isNativePlatform()) {
      setSupported(true);
      setNotice('سه صدای فارسی داخلی آماده‌اند؛ برای پخش به موتور گفتار گوشی نیاز نیست.');
      TextToSpeech.getSupportedVoices().then(result => {
        if (active) setVoices(result.voices || []);
      }).catch(() => {
        if (active) setNotice('موتور گفتار گوشی در دسترس نیست؛ موتور تبدیل متن به گفتار را در تنظیمات اندروید فعال کنید.');
      });
      TextToSpeech.getSupportedLanguages().then(result => {
        if (active) setSupportedLanguages(result.languages || []);
      }).catch(() => {});
      TextToSpeech.isLanguageSupported({ lang: 'fa-IR' }).then(result => {
        if (active && !result.supported) setNotice('صدای فارسی روی موتور گفتار این گوشی پیدا نشد؛ متن انگلیسی همچنان قابل پخش است. برای افزودن فارسی از دکمهٔ «راه‌اندازی صدای فارسی» استفاده کن.');
      }).catch(() => {});
      return () => { active = false; void TextToSpeech.stop(); };
    }
    if (!('speechSynthesis' in window)) {
      setSupported(false);
      setNotice('مرورگر از پخش گفتار پشتیبانی نمی‌کند.');
      return () => { active = false; };
    }
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => { active = false; window.speechSynthesis.removeEventListener?.('voiceschanged', load); window.speechSynthesis.cancel(); };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('voicecast-draft-v2');
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<Project>;
      if (p.schema === 'voicecast-project' && p.version === 1 && Array.isArray(p.speakers) && Array.isArray(p.turns)) {
        setSpeakers(p.speakers); setTurns(p.turns); setMode(p.mode || 'نمایشی'); setTitle(p.title || 'پروژه من');
        setSavedAt(new Date().toLocaleTimeString('fa-IR'));
      }
    } catch { /* ignore malformed local project */ }
  }, []);

  useEffect(() => {
    try {
      const p: Project = { schema: 'voicecast-project', version: 1, title, mode, speakers, turns, savedAt: new Date().toISOString() };
      localStorage.setItem('voicecast-draft-v2', JSON.stringify(p));
      setSavedAt(new Date().toLocaleTimeString('fa-IR'));
    } catch { setNotice('فضای ذخیره‌سازی مرورگر پر شده است؛ پروژه را به‌صورت فایل JSON ذخیره کنید.'); }
  }, [speakers, turns, mode, title]);

  const persianVoices = useMemo(() => Capacitor.isNativePlatform() ? bundledPersianVoices : voices.filter(v => /^fa([_-]|$)/i.test(v.lang) || /persian|farsi|فارسی/i.test(v.name)), [voices]);
  const filteredVoices = useMemo(() => voices.filter(v => (v.name + ' ' + v.lang).toLowerCase().includes(voiceSearch.toLowerCase())), [voices, voiceSearch]);
  const filteredBundledVoices = bundledPersianVoices.filter(v => (v.name + ' ' + v.id).toLowerCase().includes(voiceSearch.toLowerCase()));
  const wordCount = turns.reduce((n, t) => n + t.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const charCount = turns.reduce((n, t) => n + t.text.length, 0);
  const estimatedSeconds = Math.max(1, Math.round(charCount / 12));
  const activeSpeaker = speakers.find(s => s.id === turns[currentTurn]?.speakerId);

  function detectLanguage(text: string) { return /[\u0600-\u06FF]/.test(text) ? 'fa-IR' : 'en-US'; }
  function languageIsAvailable(lang: string) { return supportedLanguages.some(item => item.toLowerCase() === lang.toLowerCase() || item.toLowerCase() === lang.split('-')[0].toLowerCase() || item.toLowerCase().startsWith(lang.split('-')[0].toLowerCase() + '-')); }
  function toneAdjustments(tone: string) { const presets: Record<string, { speed: number; pitch: number }> = { 'روایی': { speed: 1, pitch: 1 }, 'حماسی': { speed: 0.94, pitch: 0.9 }, 'آرام': { speed: 0.84, pitch: 0.96 }, 'احساسی': { speed: 0.92, pitch: 1.08 }, 'نمایشی': { speed: 0.9, pitch: 1.14 } }; return presets[tone] || presets['روایی']; }
  function updateSpeaker(id: number, patch: Partial<Speaker>) { setSpeakers(old => old.map(s => s.id === id ? { ...s, ...patch } : s)); }
  function updateTurn(id: number, patch: Partial<Turn>) { setTurns(old => old.map(t => t.id === id ? { ...t, ...patch } : t)); }
  function addSpeaker() {
    const id = Math.max(0, ...speakers.map(s => s.id)) + 1;
    setSpeakers(old => [...old, { id, name: `گوینده ${id}`, voiceURI: `fa:${bundledPersianVoices[speakers.length % bundledPersianVoices.length].id}`, rate: 1, pitch: 1, tone: 'روایی', volume: 1 }]);
    setNotice('گویندهٔ جدید اضافه شد.');
  }
  function removeSpeaker(id: number) {
    if (speakers.length <= 1) return;
    const fallback = speakers.find(s => s.id !== id)!;
    setSpeakers(old => old.filter(s => s.id !== id));
    setTurns(old => old.map(t => t.speakerId === id ? { ...t, speakerId: fallback.id } : t));
  }
  function addTurn() { setTurns(old => [...old, { id: makeId(), speakerId: speakers[0]?.id ?? 1, text: '', pauseAfter: 0.4 }]); }
  function moveTurn(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= turns.length) return;
    setTurns(old => { const next = [...old]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }
  function splitText() {
    const source = rawText.trim();
    if (!source) { setNotice('ابتدا متن خود را در کادر متن وارد کنید.'); return; }
    const chunks = splitRule === 'paragraph'
      ? source.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean)
      : source.split(/\n+/).flatMap(line => line.split(/(?<=[.!؟؛])\s+/)).map(x => x.trim()).filter(Boolean);
    const list = chunks.length ? chunks : [source];
    const next = list.map((text, i) => ({
      id: makeId() + i,
      speakerId: assignRule === 'round' ? speakers[i % speakers.length].id : speakers[0].id,
      text, pauseAfter: 0.4
    }));
    setTurns(next);
    setNotice(`متن به ${next.length} بخش تقسیم شد. گوینده‌ها را می‌توانی تغییر بدهی.`);
  }
  function makeProject(): Project {
    return { schema: 'voicecast-project', version: 1, title, mode, speakers, turns, savedAt: new Date().toISOString() };
  }
  function exportProject() {
    downloadBlob(new Blob([JSON.stringify(makeProject(), null, 2)], { type: 'application/json;charset=utf-8' }), `${safeName(title)}.voicecast.json`);
    setNotice('فایل پروژهٔ قابل ویرایش ذخیره شد.');
  }
  function exportScript() {
    const body = turns.map((t, i) => {
      const who = speakers.find(s => s.id === t.speakerId)?.name || 'گوینده';
      return `[${i + 1}] ${who}\n${t.text}\n`;
    }).join('\n');
    downloadBlob(new Blob(['\uFEFF' + `عنوان: ${title}\nقالب: ${mode}\n\n` + body], { type: 'text/plain;charset=utf-8' }), `${safeName(title)}.txt`);
    setNotice('متن سناریو به‌صورت فایل متنی ذخیره شد.');
  }
  function safeName(value: string) { return value.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 50) || 'voicecast-project'; }
  async function importProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('حجم فایل بیشتر از ۵ مگابایت است.');
      if (file.name.endsWith('.txt')) {
        const text = await file.text(); setRawText(text); setTitle(file.name.replace(/\.txt$/i, '')); setNotice('متن وارد شد؛ برای تبدیل آن به دیالوگ، تقسیم خودکار را بزن.'); return;
      }
      const p = JSON.parse(await file.text()) as Partial<Project>;
      if (p.schema !== 'voicecast-project' || p.version !== 1 || !Array.isArray(p.speakers) || !Array.isArray(p.turns)) throw new Error('ساختار فایل پروژه معتبر نیست.');
      if (!p.speakers.length || p.speakers.length > 100 || p.turns.length > 1000) throw new Error('تعداد گویندگان یا دیالوگ‌ها خارج از محدودهٔ مجاز است.');
      const ids = new Set(p.speakers.map(s => s.id));
      if (p.turns.some(t => !ids.has(t.speakerId) || typeof t.text !== 'string')) throw new Error('ارجاع گوینده در یکی از دیالوگ‌ها معتبر نیست.');
      setSpeakers(p.speakers); setTurns(p.turns); setTitle(p.title || 'پروژه واردشده'); setMode(p.mode || 'نمایشی');
      setNotice('پروژه با موفقیت وارد شد.');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'خطا در خواندن فایل.'); }
    if (fileInput.current) fileInput.current.value = '';
  }
  function stop() {
    token.current++;
    window.speechSynthesis?.cancel();
    if (Capacitor.isNativePlatform()) { void TextToSpeech.stop(); void PersianTTS.stop(); }
    setPlaying(false); setPaused(false); setCurrentTurn(-1);
    setNotice('اجرا متوقف شد.');
  }
  function pauseResume() {
    if (Capacitor.isNativePlatform()) { setNotice('مکث در موتور گفتار اندروید در این نسخه پشتیبانی نمی‌شود؛ برای قطع صدا «توقف» را بزنید.'); return; }
    if (!('speechSynthesis' in window)) return;
    if (window.speechSynthesis.paused) { window.speechSynthesis.resume(); setPaused(false); }
    else { window.speechSynthesis.pause(); setPaused(true); }
  }
  async function playFrom(startIndex = 0, sourceTurns: Turn[] = turns) {
    const native = Capacitor.isNativePlatform();
    if (!native && !supported) { setNotice('پخش گفتار در این مرورگر پشتیبانی نمی‌شود.'); return; }
    const queue = sourceTurns.map((turn, index) => ({ turn, index })).filter(x => x.turn.text.trim()).filter(x => x.index >= startIndex);
    if (!queue.length) { setNotice('برای اجرا، حداقل یک دیالوگ دارای متن لازم است.'); return; }
    if (native) { await TextToSpeech.stop().catch(() => {}); await PersianTTS.stop().catch(() => {}); }
    else window.speechSynthesis.cancel();
    const run = ++token.current;
    setPlaying(true); setPaused(false);
    setNotice(native ? 'در حال اجرا با موتور گفتار اندروید…' : 'در حال اجرا با صدای دستگاه…');
    for (const { turn, index } of queue) {
      if (run !== token.current) return;
      const speaker = speakers.find(s => s.id === turn.speakerId) || speakers[0];
      const lang = detectLanguage(turn.text);
      const tone = toneAdjustments(speaker?.tone || 'روایی');
      const effectiveSpeed = Math.max(0.6, Math.min(1.5, (speaker?.rate ?? 1) * tone.speed));
      const effectivePitch = Math.max(0.6, Math.min(1.5, (speaker?.pitch ?? 1) * tone.pitch));
      setCurrentTurn(index);
      try {
        if (native && lang === 'fa-IR') {
          await PersianTTS.speak({ text: turn.text, voiceId: (speaker?.voiceURI || 'fa:amir').replace('fa:', ''), speed: effectiveSpeed, pitch: effectivePitch, volume: speaker?.volume ?? 1 });
        } else if (native) {
          // Do not block playback based on getSupportedLanguages(): some Android engines
          // report locale tags with different region/underscore formats. Let the native
          // engine resolve the requested BCP-47 locale and report a real synthesis error.
          const voiceIndex = voices.findIndex(v => v.voiceURI === speaker?.voiceURI && v.lang.toLowerCase().startsWith(lang.split('-')[0]));
          await TextToSpeech.speak({
            text: turn.text, lang, rate: effectiveSpeed,
            pitch: effectivePitch, volume: speaker?.volume ?? 1,
            ...(voiceIndex >= 0 ? { voice: voiceIndex } : {})
          });
        } else {
          await new Promise<void>((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(turn.text);
            utterance.lang = lang; utterance.rate = speaker?.rate ?? 1; utterance.pitch = speaker?.pitch ?? 1; utterance.volume = speaker?.volume ?? 1;
            const voice = voices.find(v => v.voiceURI === speaker?.voiceURI);
            if (voice) utterance.voice = voice;
            utterance.onend = () => resolve();
            utterance.onerror = event => event.error === 'canceled' ? resolve() : reject(new Error(event.error));
            window.speechSynthesis.speak(utterance);
          });
        }
      } catch {
        if (run !== token.current) return;
        setPlaying(false); setPaused(false);
        setNotice(native ? (lang === 'fa-IR' ? 'اجرای صدای فارسی داخلی ناموفق بود؛ فضای ذخیره‌سازی و نصب برنامه را بررسی کن.' : 'صدای انگلیسی در موتور گفتار گوشی در دسترس نیست؛ موتور گفتار اندروید را بررسی کن.') : 'پخش این بخش با خطا روبه‌رو شد.');
        return;
      }
      if (run !== token.current) return;
      const wait = Math.max(0, Math.min(5, turn.pauseAfter || 0)) * 1000;
      if (wait) await new Promise(resolve => window.setTimeout(resolve, wait));
    }
    if (run === token.current) {
      setPlaying(false); setPaused(false); setCurrentTurn(-1); setNotice('اجرای سناریو به پایان رسید.');
    }
  }
  function playMain() {
    const source = rawText.trim();
    if (!source) { playFrom(0); return; }
    const chunks = splitRule === 'paragraph'
      ? source.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean)
      : source.split(/\n+/).flatMap(line => line.split(/(?<=[.!؟؛])\s+/)).map(x => x.trim()).filter(Boolean);
    const nextTurns: Turn[] = (chunks.length ? chunks : [source]).map((text, i) => ({
      id: makeId() + i,
      speakerId: assignRule === 'round' ? speakers[i % speakers.length].id : speakers[0].id,
      text, pauseAfter: 0.4
    }));
    setTurns(nextTurns);
    setNotice('متن آماده شد؛ پخش در حال شروع است…');
    playFrom(0, nextTurns);
  }
  function resetProject() {
    stop(); setSpeakers(defaults); setTurns([]); setRawText(''); setTitle('پروژه جدید'); setMode('نمایشی'); setNotice('پروژهٔ جدید ساخته شد.');
  }

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="./" aria-label="VoiceCast AI"><div className="brand-mark"><AudioLines size={23}/></div><div><strong>VoiceCast <span>AI</span></strong><small>استودیوی اجرای چندصدایی</small></div></a>
      <div className="top-actions"><span className="top-status"><i/> نسخهٔ توسعه</span><button className="icon-btn" title="پروژه جدید" onClick={resetProject}><RotateCcw size={16}/></button></div>
    </header>

    <section className="hero">
      <div className="eyebrow"><Sparkles size={15}/> روایت را به صدا تبدیل کن</div>
      <h1>هر متن، یک <em>اجرای شنیدنی</em></h1>
      <p>سناریو بساز، نقش‌ها را تنظیم کن و اجرای صوتی را مرحله‌به‌مرحله کارگردانی کن.</p>
      <div className="hero-tags"><span><Users size={14}/> چند گوینده</span><span><AudioLines size={14}/> اجرای ترتیبی</span><span><Mic2 size={14}/> متن فارسی</span></div>
    </section>

    <section className="project-toolbar panel">
      <div className="project-title"><label htmlFor="project-title">نام پروژه</label><input id="project-title" value={title} onChange={e=>setTitle(e.target.value)} /></div>
      <div className="project-actions">
        <button className="soft-btn" onClick={exportProject}><FileJson size={15}/> ذخیره پروژه</button>
        <button className="soft-btn" onClick={()=>fileInput.current?.click()}><Upload size={15}/> ورود فایل</button>
        <button className="soft-btn" onClick={exportScript}><FileText size={15}/> خروجی متن</button>
        <input ref={fileInput} type="file" accept=".json,.voicecast.json,.txt,application/json,text/plain" hidden onChange={e=>void importProject(e.target.files?.[0])}/>
      </div>
      <small className="save-state"><Save size={12}/> ذخیره خودکار محلی {savedAt ? `· آخرین ذخیره ${savedAt}` : ''}</small>
    </section>

    <div className="workspace">
      <section className="panel script-panel">
        <div className="section-head"><div><span className="step">۱</span><div><h2>متن و سناریوی اجرا</h2><p>متن را وارد و به دیالوگ‌های مستقل تبدیل کن</p></div></div><button className="soft-btn" onClick={splitText}><WandSparkles size={15}/> تقسیم متن</button></div>
        <label className="field-label" htmlFor="source-text">متن اولیه</label>
        <textarea id="source-text" className="source-text" value={rawText} onChange={e=>setRawText(e.target.value)} placeholder="متن فارسی را اینجا بچسبان…&#10;برای تقسیم پاراگرافی، بین بندها یک خط خالی بگذار."/>
        <div className="split-options">
          <label>روش تقسیم <select value={splitRule} onChange={e=>setSplitRule(e.target.value)}><option value="sentence">جمله و خط</option><option value="paragraph">پاراگراف</option></select></label>
          <label>تخصیص گوینده <select value={assignRule} onChange={e=>setAssignRule(e.target.value)}><option value="round">نوبتی بین گویندگان</option><option value="first">همه به گوینده اول</option></select></label>
        </div>
        <div className="mode-row"><label>قالب اجرا</label><div className="chips">{['نمایشی','روایی','حماسی','گروهی'].map(x=><button key={x} className={mode===x?'chip active':'chip'} onClick={()=>setMode(x)}>{x}</button>)}</div></div>
        <div className="turn-heading"><strong>ترتیب دیالوگ‌ها</strong><span>{turns.length} بخش · {wordCount} واژه · حدود {Math.ceil(estimatedSeconds/60)} دقیقه</span></div>
        <div className="turn-list">
          {turns.map((turn,i)=><div className={currentTurn===i?'turn current':'turn'} key={turn.id}>
            <div className="turn-number">{String(i+1).padStart(2,'0')}</div>
            <div className="turn-fields">
              <select aria-label="گوینده این بخش" value={turn.speakerId} onChange={e=>updateTurn(turn.id,{speakerId:Number(e.target.value)})}>{speakers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <textarea aria-label={`متن بخش ${i+1}`} value={turn.text} placeholder="متن این دیالوگ…" onChange={e=>updateTurn(turn.id,{text:e.target.value})}/>
              <div className="turn-tools"><label>مکث بعدی <select value={turn.pauseAfter} onChange={e=>updateTurn(turn.id,{pauseAfter:Number(e.target.value)})}><option value={0}>بدون مکث</option><option value={0.3}>کوتاه</option><option value={0.7}>معمولی</option><option value={1.5}>بلند</option><option value={3}>نمایشی</option></select></label><button title="پخش همین بخش" onClick={()=>playFrom(i)}><Play size={13}/> پخش بخش</button><button title="انتقال به بالا" disabled={i===0} onClick={()=>moveTurn(i,-1)}><ChevronUp size={14}/></button><button title="انتقال به پایین" disabled={i===turns.length-1} onClick={()=>moveTurn(i,1)}><ChevronDown size={14}/></button></div>
            </div>
            <button className="icon-btn danger" aria-label="حذف دیالوگ" title="حذف دیالوگ" onClick={()=>setTurns(old=>old.filter(t=>t.id!==turn.id))}><Trash2 size={16}/></button>
          </div>)}
          {!turns.length && <div className="empty-state">هنوز دیالوگی وجود ندارد. متن وارد کن یا دیالوگ جدید بساز.</div>}
        </div>
        <button className="add-turn" onClick={addTurn}><Plus size={16}/> افزودن دیالوگ</button>
      </section>

      <aside className="panel speakers-panel">
        <div className="section-head"><div><span className="step">۲</span><div><h2>گروه گویندگان</h2><p>{speakers.length} نقش تعریف شده</p></div></div><button className="icon-btn" onClick={addSpeaker} aria-label="افزودن گوینده"><Plus size={18}/></button></div>
        <div className={persianVoices.length?'voice-note good':'voice-note'}><Volume2 size={16}/><span>{persianVoices.length ? `${persianVoices.length} صدای فارسی شناسایی شد` : 'سه مدل صدای فارسی داخلی؛ مستقل از صدای نصب‌شده روی گوشی'}</span></div>
        {Capacitor.isNativePlatform() && <div className="voice-note good"><Volume2 size={15}/><span>صداهای فارسی داخل برنامه هستند و آفلاین اجرا می‌شوند.</span></div>}
        <div className="voice-search"><Search size={14}/><input value={voiceSearch} onChange={e=>setVoiceSearch(e.target.value)} placeholder="جست‌وجوی صداها و زبان‌ها"/></div>
        {speakers.map((speaker,i)=><div className="speaker-card" key={speaker.id}>
          <div className="speaker-title"><div className={`avatar avatar-${i%4}`}>{i+1}</div><input aria-label="نام گوینده" value={speaker.name} onChange={e=>updateSpeaker(speaker.id,{name:e.target.value})}/><button className="icon-btn danger" aria-label="حذف گوینده" disabled={speakers.length===1} onClick={()=>removeSpeaker(speaker.id)}><Trash2 size={15}/></button></div>
          <label>صدای دستگاه</label><select value={speaker.voiceURI} onChange={e=>updateSpeaker(speaker.id,{voiceURI:e.target.value})}>{Capacitor.isNativePlatform() ? <>{filteredBundledVoices.map(v=><option key={v.id} value={`fa:${v.id}`}>{v.name}</option>)}</> : <><option value="">انتخاب خودکار</option>{filteredVoices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}</>}</select>
          <div className="range-line"><label>سرعت بیان</label><span>{speaker.rate.toFixed(1)}×</span></div><input className="range" type="range" min="0.6" max="1.4" step="0.1" value={speaker.rate} onChange={e=>updateSpeaker(speaker.id,{rate:Number(e.target.value)})}/>
          <div className="range-line"><label>زیر و بمی</label><span>{speaker.pitch.toFixed(1)}</span></div><input className="range" type="range" min="0.6" max="1.5" step="0.1" value={speaker.pitch} onChange={e=>updateSpeaker(speaker.id,{pitch:Number(e.target.value)})}/>
          <div className="range-line"><label>بلندی صدا</label><span>{Math.round(speaker.volume*100)}٪</span></div><input className="range" type="range" min="0" max="1" step="0.05" value={speaker.volume} onChange={e=>updateSpeaker(speaker.id,{volume:Number(e.target.value)})}/>
          <label>حال‌وهوای نقش <span className="muted">(برچسب راهنما)</span></label><div className="chips small">{tones.map(t=><button key={t} className={speaker.tone===t?'chip active':'chip'} onClick={()=>updateSpeaker(speaker.id,{tone:t})}>{t}</button>)}</div>
          <button className="test-voice" onClick={async()=>{try{if(Capacitor.isNativePlatform()){await PersianTTS.stop();await PersianTTS.speak({text:`سلام. من ${speaker.name} هستم.`,voiceId:(speaker.voiceURI || 'fa:amir').replace('fa:',''),speed:speaker.rate * toneAdjustments(speaker.tone).speed,pitch:speaker.pitch * toneAdjustments(speaker.tone).pitch,volume:speaker.volume});}else{const u=new SpeechSynthesisUtterance(`سلام. من ${speaker.name} هستم.`);u.lang='fa-IR';u.rate=speaker.rate;u.pitch=speaker.pitch;u.volume=speaker.volume;const v=voices.find(x=>x.voiceURI===speaker.voiceURI);if(v)u.voice=v;window.speechSynthesis.cancel();window.speechSynthesis.speak(u);}}catch{setNotice('آزمایش صدا ناموفق بود؛ موتور گفتار و صدای فارسی گوشی را بررسی کنید.');}}} disabled={!supported}><Volume2 size={13}/> آزمایش این گوینده</button>
        </div>)}
        <button className="add-speaker" onClick={addSpeaker}><Plus size={16}/> افزودن گوینده</button>
      </aside>
    </div>

    <section className="bottom-bar">
      <div className="bottom-copy"><div className="play-symbol"><AudioLines size={20}/></div><div><strong>{playing ? `در حال اجرا · بخش ${currentTurn+1}` : 'پیش‌نمایش اجرای متن'}</strong><small>{notice}</small></div></div>
      <div className="actions"><button className="export-btn" onClick={exportProject}><Download size={16}/> پروژه</button>{playing?<>{!Capacitor.isNativePlatform() && <button className="play-btn" onClick={pauseResume}>{paused?<Play size={17}/>:<Pause size={17}/>} {paused?'ادامه':'مکث'}</button>}<button className="stop-btn" onClick={stop}><Square size={15}/> توقف</button></>:<button className="play-btn" onClick={playMain} disabled={!supported}><Play size={17} fill="currentColor"/> اجرای سناریو</button>}</div>
    </section>
    <div className="notice-line"><Clock3 size={14}/> {charCount.toLocaleString('fa-IR')} نویسه · زمان تخمینی {Math.ceil(estimatedSeconds/60).toLocaleString('fa-IR')} دقیقه · ذخیره خودکار روی همین دستگاه</div>
    <div className="notice-line"><CircleHelp size={14}/> پیش‌نمایش از صداهای نصب‌شده در مرورگر استفاده می‌کند. این نسخه هنوز خروجی MP3، موسیقی و هم‌خوانی چندصدایی واقعی ندارد.</div>
    <footer>VoiceCast AI <span>·</span> استودیوی متن فارسی · نسخهٔ در حال توسعه</footer>
  </main>;
}