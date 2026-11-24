import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Play, Pause, Plus, Trash2, Users, WandSparkles, Volume2, Radio, Download, Mic2, Sparkles, CircleHelp } from 'lucide-react';

type Speaker = {
  id: number;
  name: string;
  voiceURI: string;
  rate: number;
  pitch: number;
  tone: string;
};
type Turn = { id: number; speakerId: number; text: string };

const initialSpeakers: Speaker[] = [
  { id: 1, name: 'راوی', voiceURI: '', rate: 0.92, pitch: 1, tone: 'روایی' },
  { id: 2, name: 'شخصیت دوم', voiceURI: '', rate: 1, pitch: 1.08, tone: 'حماسی' }
];
const initialTurns: Turn[] = [
  { id: 1, speakerId: 1, text: 'به نام خداوند جان و خرد' },
  { id: 2, speakerId: 2, text: 'این داستان، روایت ایستادگی و امید است.' },
  { id: 3, speakerId: 1, text: 'در دل تاریکی، صدایی برخاست و همه را به حرکت فراخواند.' }
];
const tones = ['روایی', 'حماسی', 'آرام', 'احساسی', 'نمایشی'];

export default function App() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>(initialSpeakers);
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [rawText, setRawText] = useState('');
  const [mode, setMode] = useState('نمایشی');
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState('متن را وارد کنید و برای هر بخش یک گوینده انتخاب کنید.');
  const [rateSupported, setRateSupported] = useState(true);
  const sequenceToken = useRef(0);

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setRateSupported(false);
      setNotice('مرورگر شما از قابلیت گفتار پشتیبانی نمی‌کند. لطفاً از Chrome یا مرورگر سازگار استفاده کنید.');
      return;
    }
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('voicecast-draft-v1');
      if (saved) {
        const draft = JSON.parse(saved) as { speakers?: Speaker[]; turns?: Turn[]; mode?: string };
        if (draft.speakers?.length) setSpeakers(draft.speakers);
        if (draft.turns) setTurns(draft.turns);
        if (draft.mode) setMode(draft.mode);
      }
    } catch {
      // A malformed local draft should not prevent the app from starting.
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('voicecast-draft-v1', JSON.stringify({ speakers, turns, mode })); }
    catch { /* Storage may be unavailable in private browsing. */ }
  }, [speakers, turns, mode]);

  const persianVoices = useMemo(
    () => voices.filter(v => /^fa([_-]|$)/i.test(v.lang) || /persian|farsi|فارسی/i.test(v.name)),
    [voices]
  );
  const selectedVoiceCount = speakers.filter(s => !!s.voiceURI).length;

  function updateSpeaker(id: number, patch: Partial<Speaker>) {
    setSpeakers(old => old.map(s => s.id === id ? { ...s, ...patch } : s));
  }
  function addSpeaker() {
    const id = Math.max(0, ...speakers.map(s => s.id)) + 1;
    setSpeakers(old => [...old, { id, name: `گوینده ${id}`, voiceURI: '', rate: 1, pitch: 1, tone: 'روایی' }]);
    setNotice('گوینده جدید اضافه شد. نام و صدای او را تنظیم کنید.');
  }
  function removeSpeaker(id: number) {
    if (speakers.length <= 1) return;
    const fallback = speakers.find(s => s.id !== id)!;
    setSpeakers(old => old.filter(s => s.id !== id));
    setTurns(old => old.map(t => t.speakerId === id ? { ...t, speakerId: fallback.id } : t));
  }
  function addTurn() {
    setTurns(old => [...old, { id: Date.now(), speakerId: speakers[0]?.id ?? 1, text: '' }]);
  }
  function updateTurn(id: number, patch: Partial<Turn>) {
    setTurns(old => old.map(t => t.id === id ? { ...t, ...patch } : t));
  }
  function splitText() {
    const source = rawText.trim();
    if (!source) {
      setNotice('ابتدا متن فارسی را در کادر متن وارد کنید.');
      return;
    }
    const lines = source.split(/\n+/).flatMap(line => line.split(/(?<=[.!؟؛])\s+/)).map(x => x.trim()).filter(Boolean);
    const chunks = lines.length ? lines : [source];
    setTurns(chunks.map((text, i) => ({
      id: Date.now() + i,
      speakerId: speakers[i % speakers.length].id,
      text
    })));
    setNotice(`متن به ${chunks.length} بخش تقسیم و بین گویندگان به‌صورت نوبتی پخش شد. نقش هر بخش قابل تغییر است.`);
  }
  function stopPreview() {
    sequenceToken.current += 1;
    window.speechSynthesis?.cancel();
    setPlaying(false);
    setNotice('پیش‌نمایش متوقف شد.');
  }
  function preview() {
    if (!rateSupported || !('speechSynthesis' in window)) {
      setNotice('این مرورگر از پخش گفتار پشتیبانی نمی‌کند.');
      return;
    }
    const queue = turns.filter(t => t.text.trim());
    if (!queue.length) {
      setNotice('برای پخش، حداقل یک بخش دارای متن لازم است.');
      return;
    }
    window.speechSynthesis.cancel();
    const token = ++sequenceToken.current;
    setPlaying(true);
    setNotice(persianVoices.length
      ? 'پیش‌نمایش به‌ترتیب بخش‌ها با صدای انتخابی دستگاه اجرا می‌شود.'
      : 'صدای فارسی مشخصی در دستگاه پیدا نشد؛ نتیجه به صداهای نصب‌شده در مرورگر بستگی دارد.');
    let index = 0;
    const speakNext = () => {
      if (token !== sequenceToken.current) return;
      if (index >= queue.length) {
        setPlaying(false);
        setNotice('پیش‌نمایش متن به پایان رسید.');
        return;
      }
      const turn = queue[index++];
      const speaker = speakers.find(s => s.id === turn.speakerId) ?? speakers[0];
      const utterance = new SpeechSynthesisUtterance(turn.text);
      utterance.lang = 'fa-IR';
      utterance.rate = speaker?.rate ?? 1;
      utterance.pitch = speaker?.pitch ?? 1;
      utterance.volume = 1;
      const deviceVoice = voices.find(v => v.voiceURI === speaker?.voiceURI);
      if (deviceVoice) utterance.voice = deviceVoice;
      utterance.onend = speakNext;
      utterance.onerror = event => {
        if (token === sequenceToken.current) {
          setPlaying(false);
          setNotice(event.error === 'canceled' ? 'پیش‌نمایش لغو شد.' : 'در پخش این بخش خطایی رخ داد. صدای دیگری انتخاب کنید.');
        }
      };
      window.speechSynthesis.speak(utterance);
    };
    speakNext();
  }

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="VoiceCast AI">
        <div className="brand-mark"><AudioLines size={23}/></div>
        <div><strong>VoiceCast <span>AI</span></strong><small>استودیوی اجرای چندصدایی</small></div>
      </a>
      <div className="top-status"><i/> نسخه آزمایشی</div>
    </header>

    <section className="hero">
      <div className="eyebrow"><Sparkles size={15}/> روایت را به صدا تبدیل کن</div>
      <h1>هر متن، یک <em>اجرای شنیدنی</em></h1>
      <p>نقش‌ها را بساز، متن را بین گویندگان تقسیم کن و اجرای فارسی را پیش‌نمایش بگیر.</p>
      <div className="hero-tags">
        <span><Users size={14}/> چند گوینده</span>
        <span><Radio size={14}/> گفت‌وگوی نمایشی</span>
        <span><Mic2 size={14}/> پشتیبانی متن فارسی</span>
      </div>
    </section>

    <div className="workspace">
      <section className="panel script-panel">
        <div className="section-head">
          <div><span className="step">۱</span><div><h2>متن و سناریوی اجرا</h2><p>متن کامل را وارد و سپس بین نقش‌ها تقسیم کنید</p></div></div>
          <button className="soft-btn" onClick={splitText}><WandSparkles size={15}/> تقسیم خودکار متن</button>
        </div>
        <label className="field-label" htmlFor="source-text">متن اولیه</label>
        <textarea id="source-text" className="source-text" value={rawText} onChange={e=>setRawText(e.target.value)} placeholder="متن فارسی خود را اینجا بچسبانید...&#10;برای تقسیم بهتر، هر پاراگراف را در یک خط جدا بنویسید."/>
        <div className="mode-row">
          <label>قالب اجرا</label>
          <div className="chips">{['نمایشی','روایی','حماسی','گروهی'].map(x=><button key={x} className={mode===x?'chip active':'chip'} onClick={()=>{setMode(x);setNotice(`قالب «${x}» انتخاب شد. این گزینه فعلاً برچسب سناریو است؛ میکس گروهی در موتور صوتی بعدی اضافه می‌شود.);}}>{x}</button>)}</div>
        </div>
        <div className="turn-heading"><strong>ترتیب دیالوگ‌ها</strong><span>{turns.length} بخش</span></div>
        <div className="turn-list">
          {turns.map((turn, i)=><div className="turn" key={turn.id}>
            <div className="turn-number">{String(i+1).padStart(2,'0')}</div>
            <div className="turn-fields">
              <select aria-label="گوینده این بخش" value={turn.speakerId} onChange={e=>updateTurn(turn.id,{speakerId:Number(e.target.value)})}>
                {speakers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <textarea aria-label={`متن بخش ${i+1}`} value={turn.text} placeholder="متن این بخش را بنویسید..." onChange={e=>updateTurn(turn.id,{text:e.target.value})}/>
            </div>
            <button className="icon-btn danger" aria-label="حذف بخش" title="حذف بخش" onClick={()=>setTurns(old=>old.filter(t=>t.id!==turn.id))}><Trash2 size={16}/></button>
          </div>)}
          {!turns.length && <div className="empty-state">هنوز بخشی برای اجرا وجود ندارد. متن را وارد و تقسیم خودکار را انتخاب کنید.</div>}
        </div>
        <button className="add-turn" onClick={addTurn}><Plus size={16}/> افزودن دیالوگ</button>
      </section>

      <aside className="panel speakers-panel">
        <div className="section-head">
          <div><span className="step">۲</span><div><h2>گروه گویندگان</h2><p>{speakers.length} نقش تعریف شده</p></div></div>
          <button className="icon-btn" onClick={addSpeaker} aria-label="افزودن گوینده"><Plus size={18}/></button>
        </div>
        <div className={persianVoices.length ? 'voice-note good' : 'voice-note'}>
          <Volume2 size={16}/>
          <span>{persianVoices.length ? `${persianVoices.length} صدای فارسی روی این دستگاه شناسایی شد` : 'صدای فارسی به امکانات گوشی و مرورگر وابسته است'}</span>
        </div>
        {speakers.map((speaker, i)=><div className="speaker-card" key={speaker.id}>
          <div className="speaker-title">
            <div className={`avatar avatar-${i%4}`}>{i+1}</div>
            <input aria-label="نام گوینده" value={speaker.name} onChange={e=>updateSpeaker(speaker.id,{name:e.target.value})}/>
            <button className="icon-btn danger" aria-label="حذف گوینده" disabled={speakers.length===1} onClick={()=>removeSpeaker(speaker.id)}><Trash2 size={15}/></button>
          </div>
          <label>صدای نصب‌شده در دستگاه</label>
          <select value={speaker.voiceURI} onChange={e=>updateSpeaker(speaker.id,{voiceURI:e.target.value})}>
            <option value="">انتخاب خودکار دستگاه</option>
            {voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
          </select>
          <div className="range-line"><label>سرعت بیان</label><span>{speaker.rate.toFixed(1)}×</span></div>
          <input className="range" type="range" min="0.6" max="1.4" step="0.1" value={speaker.rate} onChange={e=>updateSpeaker(speaker.id,{rate:Number(e.target.value)})}/>
          <div className="range-line"><label>زیر و بمی صدا</label><span>{speaker.pitch.toFixed(1)}</span></div>
          <input className="range" type="range" min="0.6" max="1.5" step="0.1" value={speaker.pitch} onChange={e=>updateSpeaker(speaker.id,{pitch:Number(e.target.value)})}/>
          <label>حال‌وهوای نقش <span className="muted">(تنظیم نمایشی)</span></label>
          <div className="chips small">{tones.map(t=><button key={t} className={speaker.tone===t?'chip active':'chip'} onClick={()=>updateSpeaker(speaker.id,{tone:t})}>{t}</button>)}</div>
        </div>)}
        <button className="add-speaker" onClick={addSpeaker}><Plus size={16}/> افزودن گوینده</button>
      </aside>
    </div>

    <section className="bottom-bar">
      <div className="bottom-copy">
        <div className="play-symbol"><AudioLines size={20}/></div>
        <div><strong>پیش‌نمایش اجرای متن</strong><small>{notice}</small></div>
      </div>
      <div className="actions">
        <button className="export-btn" disabled title="برای MP3 به موتور تبدیل متن به گفتار و تولید فایل نیاز است"><Download size={17}/> خروجی MP3 <small>مرحله بعد</small></button>
        <button className="play-btn" onClick={playing?stopPreview:preview} disabled={!rateSupported}>
          {playing?<Pause size={18}/>:<Play size={18} fill="currentColor"/>}{playing?'توقف اجرا':'پیش‌نمایش اجرا'}
        </button>
      </div>
    </section>
    <div className="notice-line"><CircleHelp size={14}/> این نسخه از صداهای موجود در سیستم شما استفاده می‌کند؛ تعداد و کیفیت صداهای فارسی در هر دستگاه متفاوت است.</div>
    <footer>VoiceCast AI <span>·</span> نسخه اولیه وب‌اپ · فایل MP3 و هم‌خوانی واقعی در مراحل بعدی توسعه می‌یابند.</footer>
  </main>;
}