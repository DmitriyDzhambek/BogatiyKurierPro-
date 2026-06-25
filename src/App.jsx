import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  Brain,
  CheckCircle2,
  Eraser,
  HardDrive,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  Monitor,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Volume2,
  Zap
} from 'lucide-react';

const electron = window.require ? window.require('electron') : null;
const ipcRenderer = electron?.ipcRenderer;

const tabs = [
  { id: 'home', label: 'Главная', icon: Sparkles },
  { id: 'voice', label: 'Голос', icon: Mic },
  { id: 'analysis', label: 'Анализ файлов', icon: Brain },
  { id: 'clean', label: 'Авто-очистка', icon: Eraser },
  { id: 'status', label: 'Статус системы', icon: Activity },
  { id: 'advice', label: 'Умные советы', icon: Lightbulb },
  { id: 'devices', label: 'Устройства', icon: Smartphone },
  { id: 'notify', label: 'Уведомления', icon: Bell },
  { id: 'jarvis', label: 'JARVIS', icon: Bot }
];

const quickCommands = ['очисти', 'статус', 'совет', 'анализ'];

function stripHtml(text) {
  return String(text || '').replace(/<[^>]*>/g, '');
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [diskInfo, setDiskInfo] = useState({ free: '--', total: '--', freePercent: 0, usedPercent: 0 });
  const [analysis, setAnalysis] = useState(null);
  const [cleanResult, setCleanResult] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [toast, setToast] = useState(null);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Отдыхайте — мы всё сделаем. Пока вы качаетесь в гамаке, Богатый курьер Pro следит за чистотой ПК.'
    }
  ]);
  const recognitionRef = useRef(null);

  const speechSupported = useMemo(() => {
    return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }, []);

  const speak = useCallback((text) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const phrase = new SpeechSynthesisUtterance(stripHtml(text));
    phrase.lang = 'ru-RU';
    phrase.rate = 0.94;
    phrase.pitch = 0.86;
    window.speechSynthesis.speak(phrase);
  }, [voiceEnabled]);

  const notify = useCallback((title, body, withVoice = true) => {
    setToast({ title, body });
    window.setTimeout(() => setToast(null), 5000);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }

    if (withVoice) speak(`${title}. ${body}`);
  }, [speak]);

  const refreshStatus = useCallback(async () => {
    if (!ipcRenderer) return null;
    const info = await ipcRenderer.invoke('get-disk-info');
    setDiskInfo(info);
    return info;
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!ipcRenderer) return null;
    setIsBusy(true);
    setActiveTab('analysis');
    try {
      const result = await ipcRenderer.invoke('analyze-disk');
      setAnalysis(result);
      notify('Анализ завершён', `Можно безопасно освободить примерно ${result.formatted}.`);
      return result;
    } finally {
      setIsBusy(false);
    }
  }, [notify]);

  const runClean = useCallback(async () => {
    if (!ipcRenderer) return null;
    setIsBusy(true);
    setActiveTab('clean');
    try {
      const result = await ipcRenderer.invoke('clean-disk');
      setCleanResult(result);
      await refreshStatus();
      notify('Очистка завершена', `Освобождено ${result.formatted}.`);
      return result;
    } finally {
      setIsBusy(false);
    }
  }, [notify, refreshStatus]);

  const getAdvice = useCallback(async () => {
    if (!ipcRenderer) return null;
    setIsBusy(true);
    setActiveTab('advice');
    try {
      const result = await ipcRenderer.invoke('ai-advice');
      setAdvice(result);
      speak(result.advice);
      return result;
    } finally {
      setIsBusy(false);
    }
  }, [speak]);

  const announceStatus = useCallback(async () => {
    setActiveTab('status');
    const info = await refreshStatus();
    if (info) speak(`На диске C свободно ${info.free} из ${info.total}. Свободно ${info.freePercent} процентов.`);
    return info;
  }, [refreshStatus, speak]);

  const addAssistantMessage = useCallback((text) => {
    setMessages((current) => [...current, { role: 'assistant', text }]);
  }, []);

  const executeCommand = useCallback(async (text) => {
    const value = text.trim();
    if (!value || !ipcRenderer) return;

    setMessages((current) => [...current, { role: 'user', text: value }]);
    const command = await ipcRenderer.invoke('voice-command', value);

    if (command.action === 'clean') {
      addAssistantMessage('Принято. Запускаю авто-очистку.');
      speak('Принято. Запускаю авто-очистку.');
      await runClean();
      return;
    }

    if (command.action === 'status') {
      const info = await announceStatus();
      addAssistantMessage(`Статус диска: свободно ${info?.free || '--'} из ${info?.total || '--'}.`);
      return;
    }

    if (command.action === 'advice') {
      const result = await getAdvice();
      addAssistantMessage(stripHtml(result?.advice || 'Совет временно недоступен.'));
      return;
    }

    if (command.action === 'analyze') {
      addAssistantMessage('Начинаю анализ файлов и безопасных зон очистки.');
      speak('Начинаю анализ файлов и безопасных зон очистки.');
      await runAnalysis();
      return;
    }

    if (command.action === 'greeting') {
      addAssistantMessage(command.message);
      speak(command.message);
      return;
    }

    const answer = await ipcRenderer.invoke('ai-chat', value);
    addAssistantMessage(answer.response);
    speak(answer.response);
  }, [addAssistantMessage, announceStatus, getAdvice, runAnalysis, runClean, speak]);

  const submitText = async () => {
    if (!prompt.trim() || isBusy) return;
    const text = prompt;
    setPrompt('');
    await executeCommand(text);
  };

  const startListening = () => {
    if (!speechSupported) {
      notify('Микрофон недоступен', 'Текущая среда не поддерживает SpeechRecognition. Используйте текстовую команду.', false);
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      notify('Команда не распознана', 'Проверьте доступ к микрофону и попробуйте снова.', false);
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      executeCommand(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  useEffect(() => {
    refreshStatus();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    const greeting = 'Отдыхайте — мы всё сделаем. Пока вы качаетесь в гамаке, я очищу ваш компьютер.';
    const timer = window.setTimeout(() => speak(greeting), 700);

    if (ipcRenderer) {
      const notificationHandler = (_event, payload) => notify(payload.title, payload.body);
      const speakHandler = (_event, text) => speak(text);
      ipcRenderer.on('show-notification', notificationHandler);
      ipcRenderer.on('speak-text', speakHandler);
      return () => {
        window.clearTimeout(timer);
        ipcRenderer.removeListener('show-notification', notificationHandler);
        ipcRenderer.removeListener('speak-text', speakHandler);
      };
    }

    return () => window.clearTimeout(timer);
  }, [notify, refreshStatus, speak]);

  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  return (
    <div className="app-shell">
      <div className="background-image" />
      <div className="background-shade" />
      <div className="gold-grid" />

      <div className="layout">
        <header className="topbar panel black-panel">
          <div className="brand-block">
            <div className="brand-seal"><ShieldCheck size={30} /></div>
            <div>
              <p className="overline">premium pc cleaner</p>
              <h1>Богатый курьер <span>Pro</span></h1>
            </div>
          </div>

          <div className="top-actions">
            <StatusBadge label={`C: ${diskInfo.freePercent}% свободно`} />
            <button
              className="black-button small"
              onClick={() => {
                const next = !voiceEnabled;
                setVoiceEnabled(next);
                ipcRenderer?.invoke('toggle-voice', next);
              }}
            >
              {voiceEnabled ? <Volume2 size={17} /> : <MicOff size={17} />}
              Голос {voiceEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </header>

        <main className="main-grid">
          <aside className="panel black-panel sidebar">
            <p className="overline side-title">рабочие вкладки</p>
            <nav className="tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} className={`tab-button ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                    <Icon size={20} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="quick-card">
              <p>Голосовые команды</p>
              <div>
                {quickCommands.map((command) => (
                  <button key={command} onClick={() => executeCommand(command)}>“{command}”</button>
                ))}
              </div>
            </div>
          </aside>

          <section className="panel content-panel">
            <div className="section-head">
              <div>
                <p className="overline">{active.label}</p>
                <h2>{activeTab === 'home' ? 'Отдыхайте — мы всё сделаем' : active.label}</h2>
              </div>
              {isBusy && <Loader2 className="spin" size={30} />}
            </div>

            <div className="tab-content">
              {activeTab === 'home' && <HomeTab startListening={startListening} runAnalysis={runAnalysis} runClean={runClean} diskInfo={diskInfo} />}
              {activeTab === 'voice' && <VoiceTab startListening={startListening} isListening={isListening} speechSupported={speechSupported} voiceEnabled={voiceEnabled} />}
              {activeTab === 'analysis' && <AnalysisTab runAnalysis={runAnalysis} analysis={analysis} />}
              {activeTab === 'clean' && <CleanTab runClean={runClean} cleanResult={cleanResult} />}
              {activeTab === 'status' && <StatusTab announceStatus={announceStatus} diskInfo={diskInfo} />}
              {activeTab === 'advice' && <AdviceTab getAdvice={getAdvice} advice={advice} />}
              {activeTab === 'devices' && <DevicesTab />}
              {activeTab === 'notify' && <NotifyTab notify={notify} diskInfo={diskInfo} />}
              {activeTab === 'jarvis' && <JarvisTab startListening={startListening} isListening={isListening} executeCommand={executeCommand} />}
            </div>
          </section>

          <aside className="panel black-panel chat-panel">
            <div className="chat-title">
              <div>
                <p className="overline">jarvis dialog</p>
                <h3>Связь с курьером</h3>
              </div>
              <button className={`mic-button ${isListening ? 'listening' : ''}`} onClick={startListening}><Mic size={24} /></button>
            </div>

            <div className="messages">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                  <span>{message.role === 'user' ? 'Вы' : 'JARVIS'}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>

            <div className="input-row">
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && submitText()}
                placeholder="Напишите: очисти, статус, совет..."
              />
              <button onClick={submitText}><Send size={19} /></button>
            </div>
          </aside>
        </main>
      </div>

      {toast && (
        <div className="toast">
          <strong>{toast.title}</strong>
          <span>{toast.body}</span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ label }) {
  return <div className="status-badge"><span />{label}</div>;
}

function HomeTab({ startListening, runAnalysis, runClean, diskInfo }) {
  return (
    <div className="home-grid">
      <div className="hero-card black-panel">
        <p className="overline">welcome</p>
        <h3>Пока вы качаетесь в гамаке, программа чистит ПК.</h3>
        <p>Нажмите кнопку, скажите команду или выберите вкладку. Все основные действия уже подключены: анализ, очистка, статус, советы, уведомления и голос.</p>
        <div className="hero-actions">
          <button className="black-button gold" onClick={startListening}><Mic size={19} /> Сказать команду</button>
          <button className="black-button" onClick={runAnalysis}><Brain size={19} /> Анализ</button>
          <button className="black-button danger" onClick={runClean}><Zap size={19} /> Очисти</button>
        </div>
      </div>
      <div className="disk-card black-panel">
        <HardDrive size={34} />
        <p>Диск C:</p>
        <strong>{diskInfo.free}</strong>
        <span>свободно из {diskInfo.total}</span>
        <div className="progress"><i style={{ width: `${diskInfo.usedPercent || 0}%` }} /></div>
      </div>
    </div>
  );
}

function VoiceTab({ startListening, isListening, speechSupported, voiceEnabled }) {
  return <Cards action="Проверить микрофон" onAction={startListening} cards={[
    ['🎤 Голосовой ввод', speechSupported ? 'Нажмите кнопку и скажите команду.' : 'SpeechRecognition не поддерживается этой средой.'],
    ['🔊 Голосовой вывод', voiceEnabled ? 'Программа говорит через динамики.' : 'Голос отключён в верхней панели.'],
    ['🤖 Команды', isListening ? 'Слушаю вас...' : 'Доступны: очисти, статус, совет, анализ.']
  ]} />;
}

function AnalysisTab({ runAnalysis, analysis }) {
  return (
    <div className="stack">
      <Cards action="Запустить анализ" onAction={runAnalysis} cards={[["🧠 Анализ файлов", 'AI-логика выбирает безопасные зоны: Temp, кэш браузеров, логи и старые загрузки обновлений.']]} />
      {analysis && <Metrics items={[['Найдено', analysis.formatted], ['Здоровье', `${analysis.health}%`], ['Время', analysis.scanTime]]} />}
      <div className="result-list">
        {(analysis?.results || []).map((item) => <ResultItem key={item.path} title={item.name} value={item.size} path={item.path} />)}
      </div>
    </div>
  );
}

function CleanTab({ runClean, cleanResult }) {
  return <div className="stack"><Cards danger action="Очистить ПК" onAction={runClean} cards={[["⚡ Авто-очистка", 'Работает по кнопке и по голосовой команде “очисти”.'], ['🛡️ Аккуратный режим', 'Удаляются только временные файлы и кэш из выбранных безопасных зон.']]} />{cleanResult && <Metrics items={[['Освобождено', cleanResult.formatted], ['Зон очищено', cleanResult.itemCount], ['Время', cleanResult.scanTime]]} />}</div>;
}

function StatusTab({ announceStatus, diskInfo }) {
  return <div className="stack"><Cards action="Сказать статус" onAction={announceStatus} cards={[["📊 Статус системы", 'Скажите “статус” — программа озвучит состояние диска.']]} /><Metrics items={[['Свободно', diskInfo.free], ['Всего', diskInfo.total], ['Свободно', `${diskInfo.freePercent}%`], ['Занято', `${diskInfo.usedPercent}%`]]} /></div>;
}

function AdviceTab({ getAdvice, advice }) {
  return <div className="stack"><Cards action="Получить совет" onAction={getAdvice} cards={[["💡 Умные советы", 'Скажите “совет” — получите рекомендацию по очистке и оптимизации.']]} />{advice && <div className="advice-box">{stripHtml(advice.advice)}</div>}</div>;
}

function DevicesTab() {
  const [deviceId] = useState(() => {
    const stored = localStorage.getItem('bk-device-id');
    if (stored) return stored;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('bk-device-id', id);
    return id;
  });
  const [connected, setConnected] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bk-connected-devices') || '[]'); }
    catch { return []; }
  });
  const [linkCopied, setLinkCopied] = useState(false);

  const appUrl = 'https://bogatiy-kurier-pro.vercel.app';
  const pairCode = `${deviceId}:${btoa(deviceId).slice(0, 8)}`;

  const copyLink = () => {
    const text = `${appUrl}?pair=${encodeURIComponent(pairCode)}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2000);
  };

  const refreshDevices = () => {
    try { setConnected(JSON.parse(localStorage.getItem('bk-connected-devices') || '[]')); }
    catch { setConnected([]); }
  };

  const removeDevice = (id) => {
    const next = connected.filter((d) => d.id !== id);
    setConnected(next);
    localStorage.setItem('bk-connected-devices', JSON.stringify(next));
  };

  return (
    <div className="devices-tab stack">
      <div className="device-hero black-panel">
        <QrCode size={72} />
        <h4>Подключить устройство</h4>
        <p>Отсканируйте QR-код в Mini app или отправьте ссылку для синхронизации.</p>
        <div className="pair-code">{pairCode}</div>
        <button className="black-button gold action" onClick={copyLink}>
          {linkCopied ? <CheckCircle2 size={18} /> : <Smartphone size={18} />}
          {linkCopied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
        </button>
      </div>

      <div className="device-list-header">
        <h4>Список ваших устройств</h4>
        <button className="black-button small" onClick={refreshDevices}><RefreshCw size={16} /> Обновить</button>
      </div>

      <div className="device-list">
        <div className="device-item black-panel">
          <Monitor size={32} />
          <div>
            <strong>Этот компьютер</strong>
            <span>{deviceId}</span>
          </div>
          <b className="active">Активно</b>
        </div>
        {connected.length === 0 && (
          <div className="device-empty black-panel">Пока нет подключенных устройств. Нажмите «Скопировать ссылку» и откройте её на телефоне.</div>
        )}
        {connected.map((device) => (
          <div className="device-item black-panel" key={device.id}>
            <Smartphone size={32} />
            <div>
              <strong>{device.name || 'Telephone'}</strong>
              <span>{device.id}</span>
            </div>
            <button className="black-button small danger" onClick={() => removeDevice(device.id)}>Отключить</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotifyTab({ notify, diskInfo }) {
  return <Cards action="Тест уведомления" onAction={() => notify('Богатый курьер Pro', `Уведомления работают. Сейчас свободно ${diskInfo.free}.`)} cards={[["🔔 Уведомления", 'При нехватке места: голос + всплывающее окно.'], ['⏱️ Фоновая проверка', 'Electron проверяет диск каждые 5 минут.'], ['💽 Текущий диск', `Свободно ${diskInfo.free} из ${diskInfo.total}.`]]} />;
}

function JarvisTab({ startListening, isListening, executeCommand }) {
  return <div className="jarvis-tab"><div className="jarvis-orb"><button onClick={startListening}>{isListening ? <Loader2 className="spin" size={58} /> : <Mic size={58} />}</button></div><div className="jarvis-commands">{quickCommands.map((command) => <button key={command} onClick={() => executeCommand(command)}>Сказать “{command}”</button>)}</div></div>;
}

function Cards({ cards, action, onAction, danger = false }) {
  return <div className="cards-wrap"><div className="cards-grid">{cards.map(([title, text]) => <div className="feature-card black-panel" key={title}><h4>{title}</h4><p>{text}</p></div>)}</div>{action && <button className={`black-button action ${danger ? 'danger' : 'gold'}`} onClick={onAction}>{action}</button>}</div>;
}

function Metrics({ items }) {
  return <div className="metrics">{items.map(([label, value]) => <div className="metric black-panel" key={`${label}-${value}`}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function ResultItem({ title, value, path }) {
  return <div className="result-item black-panel"><div><strong>{title}</strong><span>{path}</span></div><b>{value}</b></div>;
}
