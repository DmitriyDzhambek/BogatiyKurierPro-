import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  Brain,
  CheckCircle2,
  Coffee,
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
  { id: 'tips', label: 'Чаевые', icon: Coffee },
  { id: 'notify', label: 'Уведомления', icon: Bell },
  { id: 'jarvis', label: 'JARVIS', icon: Bot }
];

const wheelTabs = [
  { id: 'clean', label: 'Очистка', icon: Eraser },
  { id: 'analysis', label: 'Анализ', icon: Brain },
  { id: 'status', label: 'Статус', icon: Activity },
  { id: 'advice', label: 'Совет', icon: Lightbulb },
  { id: 'devices', label: 'Устройства', icon: Smartphone },
  { id: 'tips', label: 'Чаевые', icon: Coffee },
  { id: 'voice', label: 'Голос', icon: Mic }
];

const quickCommands = ['очисти', 'статус', 'совет', 'анализ'];

function stripHtml(text) {
  return String(text || '').replace(/<[^>]*>/g, '');
}

export default function App() {
  const remoteParams = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get('remote') !== 'true') return null;
    return {
      host: params.get('host') || '',
      port: Number(params.get('port')) || 0,
      deviceId: params.get('deviceId') || ''
    };
  }, []);

  if (remoteParams) {
    return <RemoteControl host={remoteParams.host} port={remoteParams.port} deviceId={remoteParams.deviceId} />;
  }

  const [activeTab, setActiveTab] = useState('jarvis');
  const [wheelRotation, setWheelRotation] = useState(0);
  const [animating, setAnimating] = useState(false);
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

  const selectSegment = (id, index) => {
    if (animating) return;
    const anglePerSegment = 360 / wheelTabs.length;
    const targetRotation = -index * anglePerSegment;
    setAnimating(true);
    setWheelRotation(targetRotation);
    window.setTimeout(() => {
      setActiveTab(id);
      setAnimating(false);
      if (id === 'clean') runClean();
      else if (id === 'analysis') runAnalysis();
      else if (id === 'status') announceStatus();
      else if (id === 'advice') getAdvice();
      else if (id === 'voice') startListening();
    }, 900);
  };

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

        <main className="main-grid jarvis-main">
          <aside className="panel black-panel sidebar">
            <p className="overline side-title">меню</p>
            <nav className="tabs">
              <button className="tab-button active">
                <Bot size={20} />
                <span>JARVIS</span>
              </button>
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

          <section className="panel content-panel jarvis-panel">
            <div className="jarvis-stage">
              <RadialMenu
                tabs={wheelTabs}
                rotation={wheelRotation}
                activeTab={activeTab}
                onSelect={selectSegment}
                isListening={isListening}
                startListening={startListening}
              />
              <div className="jarvis-bottom-text">
                <p className="overline">JARVIS активен</p>
                <h2>Отдыхайте — мы всё сделаем</h2>
              </div>
            </div>

            {(activeTab === 'devices' || activeTab === 'tips') && (
              <div className="jarvis-overlay">
                <button className="black-button small overlay-close" onClick={() => setActiveTab('jarvis')}>Закрыть</button>
                {activeTab === 'devices' && <DevicesTab />}
                {activeTab === 'tips' && <TipsTab />}
              </div>
            )}
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

function RadialMenu({ tabs, rotation, activeTab, onSelect, isListening, startListening }) {
  const count = tabs.length;
  const radius = 220;
  const anglePerSegment = 360 / count;
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  return (
    <div className="radial-menu">
      <svg className="wheel-rays" viewBox="0 0 600 600">
        <circle cx="300" cy="300" r="220" fill="none" stroke="rgba(244,210,122,.18)" strokeWidth="1" />
        <circle cx="300" cy="300" r="160" fill="none" stroke="rgba(244,210,122,.1)" strokeWidth="1" strokeDasharray="8 8" />
        {tabs.map((_, index) => {
          const angle = (index * anglePerSegment - 90) * Math.PI / 180;
          const x2 = 300 + Math.cos(angle) * 220;
          const y2 = 300 + Math.sin(angle) * 220;
          return <line key={index} x1="300" y1="300" x2={x2} y2={y2} stroke="rgba(244,210,122,.16)" strokeWidth="1" />;
        })}
      </svg>

      <div className="wheel" style={{ transform: `rotate(${rotation}deg)` }}>
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const angle = index * anglePerSegment - 90;
          const rad = angle * Math.PI / 180;
          const x = Math.cos(rad) * radius;
          const y = Math.sin(rad) * radius;
          const isActive = activeIndex === index;
          return (
            <button
              key={tab.id}
              className={`wheel-segment ${isActive ? 'active' : ''}`}
              style={{
                '--tx': `${x}px`,
                '--ty': `${y}px`,
                '--r': `${-rotation}deg`
              }}
              onClick={() => onSelect(tab.id, index)}
              title={tab.label}
            >
              <Icon size={28} />
              <span>{tab.label}</span>
            </button>
          );
        })}

        <button className={`wheel-center ${isListening ? 'listening' : ''}`} onClick={startListening}>
          <Bot size={42} />
          <span className="center-glow" />
        </button>
      </div>

      <div className="wheel-hint">
        <p className="overline">Выберите сектор</p>
        <p>Кликните по руне, чтобы вращать судьбу</p>
      </div>
    </div>
  );
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
  const [remoteInfo, setRemoteInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!ipcRenderer) return;
    ipcRenderer.invoke('get-remote-info').then((info) => setRemoteInfo(info)).catch(() => setRemoteInfo(null));
  }, []);

  const deviceId = remoteInfo?.deviceId || '';
  const appUrl = remoteInfo?.url || 'https://bogatiy-kurier-pro.vercel.app';

  const copyLink = () => {
    if (navigator.clipboard && appUrl) {
      navigator.clipboard.writeText(appUrl);
    }
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2000);
  };

  const testConnection = async () => {
    if (!remoteInfo) return;
    setLoading(true);
    try {
      const res = await fetch(`http://${remoteInfo.localIp}:${remoteInfo.port}/status`, { method: 'GET' });
      await res.json();
      alert('Связь с компьютером есть. Можно управлять через Mini app.');
    } catch (err) {
      alert('Не удалось связаться с компьютером. Убедитесь, что телефон и ПК в одной Wi-Fi сети.');
    }
    setLoading(false);
  };

  return (
    <div className="devices-tab stack">
      <div className="device-hero black-panel">
        <QrCode size={72} />
        <h4>Подключить устройство</h4>
        <p>Отсканируйте QR-код в Mini app или отправьте ссылку для синхронизации. Телефон и компьютер должны быть в одной Wi-Fi сети.</p>
        {remoteInfo ? (
          <>
            <div className="pair-code">{remoteInfo.localIp}:{remoteInfo.port}</div>
            <button className="black-button gold action" onClick={copyLink}>
              {linkCopied ? <CheckCircle2 size={18} /> : <Smartphone size={18} />}
              {linkCopied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
            </button>
            <button className="black-button small" onClick={testConnection} disabled={loading}>
              {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              Проверить связь
            </button>
          </>
        ) : (
          <div className="device-empty black-panel">Удаленное управление доступно только в приложении для ПК.</div>
        )}
      </div>

      <div className="device-list-header">
        <h4>Список ваших устройств</h4>
      </div>

      <div className="device-list">
        <div className="device-item black-panel">
          <Monitor size={32} />
          <div>
            <strong>Этот компьютер</strong>
            <span>{deviceId || 'Ожидание запуска приложения...'}</span>
          </div>
          <b className="active">Активно</b>
        </div>
      </div>
    </div>
  );
}

function TipsTab() {
  return (
    <div className="tips-tab stack">
      <div className="tips-hero black-panel">
        <Coffee size={72} />
        <h4>Поддержать автора</h4>
        <p>Если программа вам помогает, вы можете поблагодарить автора чаевыми на кофе или новые идеи. Любая поддержка мотивирует добавлять новые функции.</p>
        <a className="tips-button" href="https://tips.yandex.ru/guest/payment/5485470" target="_blank" rel="noreferrer">
          <Coffee size={20} />
          Отправить чаевые
        </a>
      </div>

      <div className="cards-wrap">
        <div className="cards-grid">
          <div className="feature-card black-panel">
            <h4>☕ На кофе</h4>
            <p>Помогает поддерживать энергию во время разработки новых функций.</p>
          </div>
          <div className="feature-card black-panel">
            <h4>💡 Новые идеи</h4>
            <p>Ваши идеи превращаются в новые вкладки, инструменты и улучшения.</p>
          </div>
          <div className="feature-card black-panel">
            <h4>🙏 Спасибо</h4>
            <p>Даже небольшая сумма — большая мотивация продолжать совершенствовать приложение.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RemoteControl({ host, port, deviceId }) {
  const [connected, setConnected] = useState(false);
  const [disk, setDisk] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const baseUrl = `http://${host}:${port}`;

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/status`, { method: 'GET' });
      const data = await res.json();
      setDisk(data.disk);
      setConnected(true);
      setError('');
    } catch (err) {
      setConnected(false);
      setError('Нет связи с компьютером. Проверьте Wi-Fi и что приложение запущено.');
    }
  }, [baseUrl]);

  const sendCommand = async (command) => {
    setBusy(true);
    setLastResult(null);
    try {
      const res = await fetch(`${baseUrl}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });
      const data = await res.json();
      if (data.ok) {
        setLastResult(data);
        if (data.result?.disk) setDisk(data.result.disk);
      } else {
        setError(data.error || 'Ошибка команды');
      }
    } catch (err) {
      setError('Не удалось выполнить команду. Проверьте связь.');
    }
    setBusy(false);
  };

  useEffect(() => {
    fetchStatus();
    const timer = window.setInterval(fetchStatus, 5000);
    return () => window.clearInterval(timer);
  }, [fetchStatus]);

  return (
    <div className="layout remote-layout">
      <section className="panel black-panel remote-panel">
        <div className="tab-title">
          <div>
            <span className="overline">УДАЛЕННОЕ УПРАВЛЕНИЕ</span>
            <h2>Управление ПК</h2>
          </div>
          <div className={`status-dot ${connected ? 'ok' : 'bad'}`} />
        </div>

        {error && <div className="remote-error">{error}</div>}

        <div className="metrics">
          <div className="metric black-panel"><span>Свободно</span><strong>{disk?.free || '--'}</strong></div>
          <div className="metric black-panel"><span>Всего</span><strong>{disk?.total || '--'}</strong></div>
          <div className="metric black-panel"><span>Свободно %</span><strong>{disk ? `${disk.freePercent}%` : '--'}</strong></div>
        </div>

        <div className="remote-actions">
          <button className="black-button gold action" onClick={() => sendCommand('analyze')} disabled={busy || !connected}>Анализ файлов</button>
          <button className="black-button danger action" onClick={() => sendCommand('clean')} disabled={busy || !connected}>Очистить ПК</button>
          <button className="black-button action" onClick={() => sendCommand('status')} disabled={busy || !connected}>Обновить статус</button>
          <button className="black-button action" onClick={() => sendCommand('advice')} disabled={busy || !connected}>Совет</button>
        </div>

        {busy && <div className="remote-busy"><Loader2 className="spin" size={28} /> Выполняется команда...</div>}

        {lastResult?.action === 'analyze' && lastResult.result && (
          <div className="remote-result black-panel">
            <h4>Результат анализа</h4>
            <p>Найдено мусора: <b>{lastResult.result.formatted}</b></p>
            <p>Время: {lastResult.result.scanTime}</p>
          </div>
        )}

        {lastResult?.action === 'clean' && lastResult.result && (
          <div className="remote-result black-panel">
            <h4>Результат очистки</h4>
            <p>Освобождено: <b>{lastResult.result.formatted}</b></p>
            <p>Зон очищено: {lastResult.result.itemCount}</p>
            <p>Время: {lastResult.result.scanTime}</p>
          </div>
        )}

        {lastResult?.action === 'advice' && lastResult.result && (
          <div className="remote-result black-panel">
            <h4>Совет</h4>
            <p>{lastResult.result.advice}</p>
          </div>
        )}

        <div className="remote-footer">
          <span>Устройство: {deviceId || host}</span>
        </div>
      </section>
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
