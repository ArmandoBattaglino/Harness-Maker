const normalizeCompressedChatWord = (word = '') => String(word ?? '')
  .normalize('NFD')
  .replace(/\p{M}+/gu, '')
  .toLowerCase();

const CHAT_WORDS = [
  'a', 'agent', 'agents', 'al', 'all', 'alla', 'alle', 'allo', 'also', 'ambiente', 'an',
  'analisi', 'analizzare', 'and', 'appreciated', 'are', 'aspetti', 'attivita', 'aumentare',
  'autonomamente', 'autonomia', 'aziende', 'base', 'be', 'beautiful', 'been', 'benefici',
  'beneficio', 'best', 'both', 'bright', 'buon', 'buona', 'caloroso', 'can', 'casa', 'che',
  'chi', 'chiave', 'ciao', 'collected', 'come', 'completed', 'con', 'concentrarsi', 'conciso',
  'connection', 'connections', 'consentono', 'consente', 'contains', 'context', 'costi', 'could',
  'da', 'dal', 'day', 'dei', 'del', 'della', 'delle', 'dello', 'development', 'di',
  'different', 'dipendenti', 'diverse', 'diversi', 'do', 'dove', 'downstream', 'due',
  'durante', 'e', 'ecco', 'ed', 'efficienza', 'employees', 'equilibrio', 'era', 'esigenze',
  'esprimendo', 'essere', 'everyone', 'execute', 'familiari', 'fantastic', 'fare', 'filled',
  'final', 'finale', 'flessibile', 'flessibilita', 'flexibility', 'for', 'formale',
  'friend', 'friendliness', 'from', 'funzionato', 'generate', 'generated', 'gestione',
  'gestire', 'giorno', 'globale', 'greeting', 'greetings', 'greater', 'ha', 'handoff',
  'hanno', 'has', 'have', 'hello', 'help', 'ho', 'how', 'i', 'il', 'importante', 'in',
  'include', 'includono', 'inoltre', 'instead', 'is', 'it', 'italian', 'its', 'joy',
  'key', 'kind', 'la', 'language', 'lavorare', 'lavoratori', 'lavorativo', 'lavoro',
  'le', 'life', 'lo', 'loro', 'maggiore', 'making', 'meet', 'meglio', 'meno', 'mentre',
  'message', 'messages', 'migliore', 'modo', 'molto', 'moments', 'more', 'most',
  'nel', 'nella', 'non', 'not', 'nostro', 'ogni', 'or', 'orari', 'orario', 'organizzare',
  'our', 'output', 'parallel', 'particolarmente', 'pay', 'pendolarismo', 'per',
  'permette', 'permettendo', 'permettono', 'persona', 'personale', 'personali',
  'personal', 'piu', 'pleasure', 'poiche', 'positive', 'possibilita', 'possono',
  'prestazioni', 'principale', 'produttivita', 'produttivo', 'professionale',
  'progetto', 'project', 'propri', 'proprio', 'quando', 'questo', 'questa',
  'quindi', 'raggiungere', 'remoto', 'remote', 'report', 'reporter', 'request', 'requested',
  'research', 'resoconto', 'result', 'results', 'riassunto', 'riduce', 'ridurre',
  'riduzione', 'risparmio', 'risultati', 'runtime', 'salute', 'saluti', 'se',
  'senza', 'share', 'shared', 'should', 'si', 'significativamente', 'smile', 'smiles',
  'sono', 'spirits', 'spostamento', 'stress', 'structured', 'sua', 'success',
  'successfully', 'sui', 'sul', 'sulla', 'suo', 'summary', 'summarize',
  'talenti', 'task', 'tempo', 'that', 'the', 'their', 'them', 'things', 'time',
  'tono', 'tra', 'translation', 'trasporti', 'tre', 'true', 'tutti', 'un', 'una',
  'uno', 'upstream', 'ufficio', 'user', 'utenze', 'valued', 'vantaggi',
  'vita', 'warmth', 'welcome', 'what', 'which', 'will', 'with', 'wonderful',
  'workflow', 'work', 'working', 'you', 'your',
  // Extended Italian vocabulary for ConPTY decompression
  'adattare', 'affitti', 'anche', 'aziendali', 'bacino', 'ciascun', 'collaborazione',
  'completare', 'denaro', 'eliminazione', 'forniture', 'garantisce', 'generale',
  'giornata', 'grande', 'lavorativa', 'lavoratore', 'limitazioni', 'luogo',
  'migliorano', 'notevole', 'numerosi', 'offre', 'opera', 'operativi', 'opportunita',
  'paragrafo', 'primo', 'proprie', 'qualita', 'riassuntivo',
  // History/geography/culture vocabulary
  'acqua', 'alto', 'altezza', 'anfiteatro', 'antico', 'antichi', 'arena', 'attraverso',
  'battaglia', 'battaglie', 'canale', 'canali', 'capacita', 'chiamato', 'circa',
  'citta', 'costruzione', 'dopo', 'enormi', 'erano', 'fatto',
  'fatti', 'famoso', 'fino', 'fondamenta', 'furono', 'gladiatori', 'guerra',
  'imperatore', 'impero', 'imperiale', 'impressionanti', 'interessanti', 'isole',
  'laguna', 'largo', 'larghezza', 'lungo', 'lunghezza', 'metri', 'mondo',
  'navale', 'navali', 'nave', 'navi', 'nei', 'numero', 'oltre', 'palazzi',
  'parte', 'ponte', 'ponti', 'porta', 'poteva', 'pratica', 'proteggeva',
  'pubblico', 'rapido', 'rete', 'romano', 'romani', 'roma', 'secolo', 'secoli',
  'simulare', 'sistema', 'sotto', 'spettacolo', 'spettatori', 'storia', 'storico',
  'storica', 'storici', 'struttura', 'suoi', 'superficie', 'telo',
  'trasporto', 'utilizzato', 'utilizzati', 'vaporetti', 'veloce', 'venezia',
  'veneziano', 'veniva', 'vere', 'verso',
  // Common Italian connectors and modifiers
  'accurati', 'ancora', 'aveva', 'avevano', 'completamente',
  'dalla', 'dalle', 'dentro', 'enorme',
  'fra', 'grazie', 'insieme', 'invece', 'ma', 'mai',
  'nelle', 'nello', 'oggi', 'oppure', 'ora',
  'permetteva', 'poi', 'prima', 'propria', 'quale',
  'quasi', 'quella', 'quelle', 'quello', 'queste', 'questi',
  'rendeva', 'resa', 'reso', 'rispetto', 'sopra', 'stata', 'stato',
  'stessa', 'stesso', 'sue', 'tanto', 'tuttavia',
  'tutto', 'tutta', 'unico', 'vero', 'vera',
  // Food/culture vocabulary
  'arte', 'basilico', 'bianco', 'colori', 'cottura', 'creata', 'cucina',
  'diametro', 'disciplinare', 'forno', 'gastronomica', 'gesto', 'icona',
  'impasto', 'ingredienti', 'italiana', 'italiano', 'legna', 'lievitare',
  'margherita', 'metodo', 'mozzarella', 'napoletana', 'napoletano', 'napoli',
  'patrimonio', 'piatto', 'pizza', 'pizzaiolo', 'pomodoro', 'preparazione',
  'preparare', 'regina', 'regole', 'rappresentano', 'riconosciuto', 'rosso',
  'sapore', 'savoia', 'scegliendo', 'solo', 'tradizionale', 'tricolore', 'verde',
  // Common verbs/adjectives
  'avvenire', 'chiamata', 'compreso', 'conosciuta', 'creato', 'dedicata',
  'diventata', 'dovrebbe', 'entro', 'essendo', 'famosa', 'incluso',
  'intorno', 'migliori', 'misura', 'mondiale', 'necessario',
  'particolare', 'possibile', 'potrebbe', 'produce', 'punto', 'risulta',
  'sempre', 'serve', 'speciale', 'superare', 'tipica', 'tipico',
  'tradizione', 'trova', 'ultimo', 'unica',
  // English common words for stream-json token-boundary repair
  'allowed', 'although', 'ancient', 'animals', 'approximately', 'beautiful',
  'because', 'beneath', 'between', 'building', 'buildings', 'centuries',
  'channeled', 'combined', 'combat', 'consecutive', 'contained', 'converted',
  'counterweight', 'creating', 'crocodiles', 'damage', 'deliberately',
  'detachment', 'directly', 'distinctive', 'dramatically', 'earthquake',
  'elaborate', 'elephants', 'emperor', 'empire', 'engineering', 'enormous',
  'entrances', 'equipped', 'essentially', 'excitement', 'exclusively',
  'executions', 'expertise', 'expressed', 'extraordinarily', 'featured',
  'fighters', 'flooding', 'fortified', 'generosity', 'gladiatorial',
  'heightening', 'horizontal', 'however', 'inaugurated', 'including',
  'intricate', 'lateral', 'lavish', 'manipulated', 'matched', 'mechanical',
  'medieval', 'memory', 'modern', 'mounted', 'mythological', 'official',
  'officially', 'operated', 'operations', 'overlook', 'overlooked', 'palace',
  'passage', 'political', 'powerful', 'prominent', 'pulleys', 'purpose',
  'recreations', 'reenactments', 'repurposed', 'residences', 'retractable',
  'scavenging', 'sections', 'shielded', 'simultaneous', 'sophisticated',
  'specifically', 'spectacle', 'spectacles', 'spectacular', 'spectators',
  'stadium', 'staggering', 'stripped', 'structure', 'subterranean',
  'symbolically', 'systematically', 'technology', 'trapdoors', 'tunnels',
  'vertical', 'warships', 'watchtowers', 'wooden',
  // Italian extended — words seen broken in Playwright E2E tests
  'allagare', 'antichita', 'blocchi', 'clamore', 'conferma', 'contempo',
  'continua', 'contrappesi', 'davvero', 'dimostrare', 'dimostrando',
  'duemila', 'esercitare', 'fragilita', 'fragore', 'grandezza',
  'impossibile', 'invita', 'numerose', 'offrendo', 'perfino', 'persino',
  'ritirare', 'soltanto', 'trasformato',
  // Wave 2 — additional Italian words from Augustus E2E test
  'concentrando', 'costituiscono', 'durare', 'lacerata', 'militare',
  'moderni', 'periodo', 'successori', 'trasformare', 'celebrare',
  'combattimenti', 'costruire', 'diventato', 'dominare', 'espansione',
  'esercito', 'fondatore', 'governo', 'inaugurazione', 'ingegneria',
  'laterali', 'magnifico', 'marittimo', 'massimo', 'monumentale',
  'potenza', 'predominante', 'predecessore', 'provincia', 'ricostruire',
  'riformare', 'stabilire', 'territorio', 'trasportare', 'vittoria',
  // Wave 3 — Augustus Essay E2E: broken tokens in Writer output
  'secondo', 'confini', 'modello', 'sopravvisse', 'medievale', 'moderna',
  'nobilitare', 'dimostro', 'profondita', 'amministrazione', 'burocratico',
  'permanente', 'efficiente', 'riorganizzare', 'protezione', 'fioritura',
  'urbanisti', 'mattoni', 'marmo', 'espressione', 'attribuita',
  'trascende', 'influenzo', 'strutture', 'contribui', 'diffondere',
  'civiltà', 'duraturo', 'disordine', 'comprendere', 'presente',
  'prevalere', 'rivale', 'concentrare', 'sancendo', 'esaurito',
  'prosperita', 'consolidarono', 'conobbero', 'sicurezza', 'eguali',
  'istituì', 'fiscale', 'professionale', 'governare', 'immenso',
  'mecenate', 'illuminato', 'irripetibile', 'culturale', 'composero',
  'canone', 'letterario', 'occidente', 'trasformarono', 'celebre',
  'occidentale', 'eredita', 'imperiale', 'politiche', 'medievali',
  'diritto', 'fondamenta', 'estremo', 'lezione', 'governa',
  // Wave 4 — Leonardo da Vinci E2E: additional broken Italian words
  'gioconda', 'ignorare', 'visiera', 'considerano', 'macchina',
  'costituisce', 'altrettanto', 'fantasticare', 'concrete', 'permettere',
  'modernita', 'ingegnere', 'inventore', 'visionario', 'anticipare',
  'lucidita', 'attoniti', 'automa', 'cavaliere', 'meccanismo',
  'antropomorfo', 'pulegge', 'rigorosissimo', 'anatomia', 'meccanica',
  'discipline', 'naturalezza', 'precedenti', 'rivoluzionario',
  'terraferma', 'elicottero', 'concettuale', 'antenato', 'tecnologia',
  'realizzarlo', 'sorprendente', 'semovente', 'programmabile',
  'progenitore', 'automobile', 'competenza', 'idraulica', 'applicazioni',
  'durevoli', 'perfeziono', 'dimostrando', 'tangibili', 'comunita',
  'disinvoltura', 'immaginazione', 'scafandro', 'subacquea',
  'respirazione', 'sabotare', 'inquietante', 'incrollabile',
  'rinascimento', 'raggiungerlo', 'semplicemente', 'accidente',
  // BPE token-boundary words: fragments individually valid but merged form is the real word
  'chilometri', 'chilometro', 'assenza', 'piastre', 'canyon', 'antiche',
  'anno', 'anni', 'pari', 'kilometri', 'hanno', 'sulla', 'sulle', 'sullo',
  'delle', 'dello', 'nella', 'nelle', 'nello', 'dalle', 'dallo',
  'altitudine', 'diametro', 'perimetro', 'parametro', 'centimetri',
  'millimetri', 'atmosfera', 'temperatura', 'pressione', 'composizione',
  'formazione', 'superficie', 'distanza', 'dimensioni', 'dimensione',
  'esplorazione', 'osservazione', 'rivoluzione', 'rotazione', 'inclinazione',
  'ghiaccio', 'ossigeno', 'idrogeno', 'carbonio', 'azoto', 'minerali',
  'vulcanica', 'vulcanico', 'geologica', 'geologico', 'marziano', 'marziana',
  'pianeta', 'satellite', 'asteroide', 'cometa', 'orbita', 'gravita',
  'terrestre', 'solare', 'cosmico', 'cosmica', 'galattico', 'spaziale',
  'dura', 'duro', 'duri', 'pure', 'pare', 'pari', 'meno', 'seno',
  'tetto', 'notte', 'lotte', 'rotte', 'cotte', 'passo', 'basso',
  'cura', 'sera', 'nera', 'vera', 'pura', 'duro', 'muro', 'faro',
  'anno', 'hanno', 'fanno', 'sanno', 'vanno', 'danno', 'stanno',
  'canne', 'panne', 'latte', 'gatte', 'notte', 'rotte',
  'tettoniche', 'tettonico', 'tettonica', 'tettonici',
  'atmosferica', 'atmosferico', 'atmosferiche', 'atmosferici',
  'sorprendentemente', 'impressionante', 'impressionanti',
  'grandissimo', 'grandissima', 'bellissimo', 'bellissima',
  'interessante', 'interessanti', 'incredibile', 'incredibili',
  'notevolmente', 'relativamente', 'approssimativamente',
  'contro', 'circa', 'dentro', 'dietro', 'senza', 'lungo', 'sotto',
  'sopra', 'oltre', 'verso', 'presso', 'durante', 'mediante', 'tramite',
  'portata', 'portato', 'portati', 'portate',
  'localizzare', 'immaginare', 'superando', 'superare',
  'comunicare', 'comunicazione', 'comunicazioni',
  'orchestrare', 'orchestrator', 'intermediario',
  'predatore', 'predatori', 'cacciatore', 'cacciatori',
  'sonnolenta', 'sonnolento', 'eccezionale', 'eccezionali',
  'formidabile', 'formidabili', 'straordinario', 'straordinaria',
  // Common Italian words frequently broken by tokenizer
  'attraversare', 'caratteristica', 'caratteristiche', 'completamente',
  'considerare', 'consapevolezza', 'contemporaneo', 'determinazione',
  'fondamentale', 'fondamentali', 'immediatamente', 'importanza',
  'indipendente', 'inizialmente', 'intelligenza', 'interessante',
  'meravigliosa', 'meraviglioso', 'naturalmente', 'opportunamente',
  'organizzazione', 'particolarmente', 'perfettamente', 'probabilmente',
  'rappresentare', 'responsabilita', 'significativo', 'sostanzialmente',
  'straordinario', 'straordinaria', 'tradizionalmente', 'trasformazione',
  'universalmente', 'velocemente',
  // Wave 5 — Concatenation repair: common Italian words needed for DP word splitting
  'eppure', 'oppure', 'vicino', 'vicina', 'vicini', 'vicine',
  'durata', 'estati', 'estate', 'inverni', 'inverno', 'primavera', 'autunno',
  'stagione', 'stagioni', 'vulcano', 'vulcani', 'calendario',
  'affascinante', 'peculiare', 'pieno', 'piena', 'pieni', 'piene',
  'estremi', 'estremo', 'continuamente', 'custodendo',
  'regalando', 'significa', 'protrae', 'protrarre',
  'nostre', 'nostri', 'nostra', 'giorni', 'doppia', 'doppio',
  'già', 'perché', 'così', 'però', 'né', 'più',
  'ai', 'agli', 'dai', 'dagli', 'sui', 'sugli',
  'anno', 'anni', 'mese', 'mesi', 'settimana', 'settimane',
  'straordinari', 'record', 'intero', 'intera', 'interi', 'intere',
  'stupire', 'smette', 'smettere', 'piuttosto', 'dunque', 'ebbene',
  'soltanto', 'ciascuno', 'ciascuna', 'qualsiasi', 'comunque',
  'nemmeno', 'neppure', 'tuttavia', 'sebbene', 'affinché',
  'nonostante', 'malgrado', 'benché', 'purché', 'cosicché',
  'altrimenti', 'pertanto', 'laddove', 'dovunque', 'ovunque',
  'qualunque', 'chiunque', 'attraverso', 'momento', 'passando',
  'inizio', 'iniziale', 'precedente', 'successivo', 'successiva',
  'turno', 'invio', 'messaggio', 'messaggi', 'scrittore', 'ricercatore',
  'completata', 'completato', 'chiedendo', 'chiedendogli',
  'rispondere', 'rispondermi', 'scrivere', 'descrivere',
  'riassunto', 'riassuntivo', 'riassuntiva', 'paragrafo',
  'pianeta', 'marziane', 'terrestre', 'terrestri', 'solare', 'solari',
  'profondo', 'profondi', 'profonda', 'profonde',
  'lunghissimi', 'lunghissimo', 'lunghissima',
  'conferma', 'confermare', 'sfidare', 'immaginazione',
  // Common Italian preposition+article contractions (prevent a+i → ai splitting)
  'ai', 'al', 'allo', 'alla', 'alle', 'agli',
  'dai', 'dal', 'dallo', 'dalla', 'dalle', 'dagli',
  'sui', 'sul', 'sullo', 'sulla', 'sulle', 'sugli',
  'nei', 'nel', 'nello', 'nella', 'nelle', 'negli',
  // Unit abbreviations (normalized to lowercase for matching)
  'khz', 'mhz', 'ghz', 'thz',
  // Wave 6 — Proper nouns and words needed for [A-Z]+[a-z] merge
  'marte', 'giove', 'saturno', 'venere', 'mercurio', 'nettuno', 'urano',
  'terra', 'luna', 'sole', 'olimpo', 'roma', 'napoli', 'venezia',
  'europa', 'italia', 'francia', 'germania', 'spagna',
  // Common words seen concatenated in E2E
  'sistema', 'solare', 'intero', 'intera', 'intere', 'interi',
  'grande', 'grandi', 'colossale', 'enorme', 'enormi',
  'esistenza', 'assenza', 'tettonica', 'placche', 'magma',
  'permesso', 'accumularsi', 'punto', 'milioni', 'milione',
  'impressionante', 'impressionanti', 'estende', 'estendere',
  'lunghezza', 'larghezza', 'profondita', 'dimensioni', 'dimensione',
  'rendono', 'rendere', 'confronto', 'modesta', 'modesto',
  'scalanatura', 'struttura', 'strutture', 'propria', 'proprio',
  'propri', 'proprie',   'redazione', 'risultati', 'passo',
  // Wave 7 — Words incorrectly split by DP (7+ chars that need protection)
  'secondi', 'secondo', 'lontano', 'lontana', 'lontani', 'lontane',
  'minuti', 'minuto', 'terrestre', 'terrestri', 'soltanto',
  'tuttavia', 'sebbene', 'durante', 'mediante', 'ciascuno', 'ciascuna',
  'qualsiasi', 'comunque', 'nonostante', 'altrimenti', 'pertanto',
  'poiché', 'perché', 'finché', 'affinché', 'benché', 'giacché',
  'siccome', 'cosicché', 'sebbene', 'purché', 'quantunque',
  'avrebbe', 'sarebbe', 'potrebbe', 'dovrebbe', 'vorrebbe',
  'farebbe', 'direbbe', 'starebbe', 'saprebbe', 'parrebbe',
  'assenza', 'presenza', 'essenza', 'potenza', 'scienza',
  'distanza', 'costanza', 'sostanza', 'speranza', 'conoscenza',
  'colossale', 'possibile', 'impossibile', 'terribile', 'incredibile',
  'notevole', 'generale', 'speciale', 'naturale', 'centrale',
  'modesta', 'modesto', 'diverso', 'diversa', 'diversi', 'diverse',
  'terrestre', 'celeste', 'campestre', 'silvestre', 'rupestre',
  'lontano', 'vicino', 'esterno', 'interno', 'supremo',
  // Wave 8 — Missing Italian adjective plurals and Mars/space vocabulary
  'vertiginoso', 'vertiginosa', 'vertiginosi', 'vertiginose',
  'peculiari', 'peculiare', 'misterioso', 'misteriosa', 'misteriosi', 'misteriose',
  'affascinanti', 'affascinato', 'affascinata',
  'calendesimale', 'abituale', 'abituali', 'abitudini',
  'portata', 'irripetibile', 'irripetibili',
  'approssimativo', 'approssimativa', 'approssimativi', 'approssimative',
  'climatico', 'climatica', 'climatici', 'climatiche',
  'geologiche', 'geologici', 'vulcaniche', 'vulcanici',
  'esplorativo', 'esplorativa', 'esplorativi', 'esplorative',
  'rappresentare', 'rappresentano', 'rappresenta',
  'continua', 'continuare', 'continuano', 'continuamente',
  'raggiungerlo', 'raggiungere', 'raggiungono', 'raggiunto',
  'complessivamente', 'approssimativamente', 'particolarmente',
  'notevolmente', 'significativamente', 'relativamente',
  'prevalentemente', 'sostanzialmente', 'fondamentalmente',
  'recentemente', 'attualmente', 'principalmente', 'inizialmente',
];

const CHAT_WORD_SET = new Set(CHAT_WORDS.map((word) => normalizeCompressedChatWord(word)));
const CHAT_WORD_MAX_LEN = CHAT_WORDS.reduce((max, word) => Math.max(max, word.length), 0);
const RESTORABLE_CHAT_TOKEN_RE = /^(?:[A-Z\u00C0-\u00D6\u00D8-\u00DE][a-z\u00DF-\u00F6\u00F8-\u00FF]{6,}|[a-z\u00DF-\u00F6\u00F8-\u00FF]{7,})$/u;
const RESTORABLE_CHAT_TOKEN_MATCH_RE = /(?:[A-Z\u00C0-\u00D6\u00D8-\u00DE][a-z\u00DF-\u00F6\u00F8-\u00FF]{6,}|[a-z\u00DF-\u00F6\u00F8-\u00FF]{7,})/gu;
const LEADING_CHAT_CONNECTORS = new Set(['a', 'e', 'i', 'il', 'la', 'le', 'lo', 'the', 'un', 'una', 'uno']);

function isReadableChatToken(token = '') {
  const raw = String(token ?? '');
  if (!raw) return false;
  const normalized = normalizeCompressedChatWord(raw);
  if (CHAT_WORD_SET.has(normalized)) return true;
  return /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{4,}$/u.test(raw);
}

function restoreLeadingConnectorCompressedToken(token = '') {
  if (!token || token.length < 10) return token;

  const connector = token.charAt(0);
  if (!LEADING_CHAT_CONNECTORS.has(normalizeCompressedChatWord(connector))) return token;

  const remainder = token.slice(1);
  if (!/^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{7,}$/u.test(remainder)) return token;

  const exactSplit = splitKnownWordSequence(remainder);
  if (exactSplit) return `${connector} ${exactSplit}`;

  const greedySplit = restoreCompressedChatTokenGreedy(remainder);
  if (!greedySplit || greedySplit === remainder) return token;
  return `${connector} ${greedySplit}`;
}

function isRestorableChatToken(token = '') {
  return /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{7,}$/u.test(token);
}

function pickBetterSplit(candidate, current) {
  if (!candidate) return current;
  if (!current) return candidate;
  if (candidate.score !== current.score) return candidate.score > current.score ? candidate : current;
  if (candidate.parts.length !== current.parts.length) {
    return candidate.parts.length < current.parts.length ? candidate : current;
  }
  return candidate;
}

function splitKnownWordSequence(token = '') {
  if (!token || !isRestorableChatToken(token)) return null;
  if (token.length > 200) return null;

  const normalizedToken = normalizeCompressedChatWord(token);
  const memo = new Map();

  const visit = (index) => {
    if (index === normalizedToken.length) {
      return { score: 0, parts: [] };
    }
    if (memo.has(index)) return memo.get(index);

    let best = null;
    for (let length = 1; length <= CHAT_WORD_MAX_LEN && index + length <= normalizedToken.length; length += 1) {
      const slice = normalizedToken.slice(index, index + length);
      if (!CHAT_WORD_SET.has(slice)) continue;

      const rest = visit(index + length);
      if (!rest) continue;

      const score = rest.score + (length * length) - (length === 1 ? 3 : 0);
      const candidate = {
        score,
        parts: [token.slice(index, index + length), ...rest.parts],
      };
      best = pickBetterSplit(candidate, best);
    }

    memo.set(index, best);
    return best;
  };

  const best = visit(0);
  if (!best || best.parts.length < 2) return null;
  return best.parts.join(' ');
}

function aggressivelyRestoreLongChatToken(token = '') {
  if (!token || token.length < 18 || !isRestorableChatToken(token)) return token;
  if (token.length > 200) return token;
  const connectorSplit = restoreLeadingConnectorCompressedToken(token);
  if (connectorSplit !== token) return connectorSplit;
  const exactSplit = splitKnownWordSequence(token);
  if (exactSplit) return exactSplit;

  const greedy = restoreCompressedChatTokenGreedy(token);
  if (!greedy) return token;

  const pieces = greedy.split(' ').filter(Boolean);
  if (pieces.length < 3) return token;
  if (pieces.join('').length !== token.length) return token;
  return greedy;
}

function restoreCompressedChatTokenGreedy(token = '', normalizedToken = normalizeCompressedChatWord(token)) {
  if (!token || !isRestorableChatToken(token)) return null;
  if (token.length > 200) return null;

  const parts = [];
  let index = 0;

  while (index < normalizedToken.length) {
    let bestEnd = -1;

    for (
      let length = Math.min(CHAT_WORD_MAX_LEN, normalizedToken.length - index);
      length >= 1;
      length -= 1
    ) {
      const slice = normalizedToken.slice(index, index + length);
      if (!CHAT_WORD_SET.has(slice)) continue;
      bestEnd = index + length;
      break;
    }

    if (bestEnd === -1) return null;
    parts.push({ start: index, end: bestEnd });
    index = bestEnd;
  }

  if (parts.length < 2) return null;
  return parts.map((part) => token.slice(part.start, part.end)).join(' ');
}

function restoreCompressedChatToken(token = '') {
  if (!token || !isRestorableChatToken(token)) return token;
  if (token.length > 200) return token;
  const connectorSplit = restoreLeadingConnectorCompressedToken(token);
  if (connectorSplit !== token) return connectorSplit;

  const exactSplit = splitKnownWordSequence(token);
  if (exactSplit) return exactSplit;

  const normalizedToken = normalizeCompressedChatWord(token);
  if (CHAT_WORD_SET.has(normalizedToken)) return token;

  const states = new Array(normalizedToken.length + 1).fill(null);
  states[0] = { score: 0, matchedChars: 0, matchedWords: 0, parts: [] };

  const pickBetterState = (candidate, current) => {
    if (!candidate) return current;
    if (!current) return candidate;
    if (candidate.score !== current.score) return candidate.score > current.score ? candidate : current;
    if (candidate.matchedChars !== current.matchedChars) {
      return candidate.matchedChars > current.matchedChars ? candidate : current;
    }
    if (candidate.matchedWords !== current.matchedWords) {
      return candidate.matchedWords > current.matchedWords ? candidate : current;
    }
    return candidate.parts.length < current.parts.length ? candidate : current;
  };

  for (let index = 0; index < normalizedToken.length; index += 1) {
    const current = states[index];
    if (!current) continue;

    const unmatchedState = {
      score: current.score - 3,
      matchedChars: current.matchedChars,
      matchedWords: current.matchedWords,
      parts: [...current.parts, { start: index, end: index + 1, matched: false }],
    };
    states[index + 1] = pickBetterState(unmatchedState, states[index + 1]);

    for (let length = 1; length <= CHAT_WORD_MAX_LEN && index + length <= normalizedToken.length; length += 1) {
      const slice = normalizedToken.slice(index, index + length);
      if (!CHAT_WORD_SET.has(slice)) continue;
      const matchState = {
        score: current.score + (length * 2) - (length === 1 ? 2 : 0),
        matchedChars: current.matchedChars + length,
        matchedWords: current.matchedWords + 1,
        parts: [...current.parts, { start: index, end: index + length, matched: true }],
      };
      states[index + length] = pickBetterState(matchState, states[index + length]);
    }
  }

  const result = states[normalizedToken.length];
  if (!result) return restoreCompressedChatTokenGreedy(token, normalizedToken) ?? token;

  const coverage = result.matchedChars / token.length;
  const minimumCoverage = token.length < 12 ? 0.85 : 0.6;
  const minimumScore = token.length * (token.length < 12 ? 0.7 : 0.35);
  if (result.matchedWords < 2 || coverage < minimumCoverage || result.score <= minimumScore) {
    return restoreCompressedChatTokenGreedy(token, normalizedToken) ?? token;
  }

  const matchedParts = result.parts.filter((part) => part.matched);
  const singleCharMatches = matchedParts.filter((part) => (part.end - part.start) === 1).length;
  const tinyMatches = matchedParts.filter((part) => (part.end - part.start) <= 2).length;
  if (singleCharMatches > 1 || tinyMatches > 3) {
    return restoreCompressedChatTokenGreedy(token, normalizedToken) ?? token;
  }

  const mergedParts = [];
  for (const part of result.parts) {
    const previous = mergedParts.at(-1);
    if (previous && !previous.matched && !part.matched && previous.end === part.start) {
      previous.end = part.end;
    } else {
      mergedParts.push({ ...part });
    }
  }

  return mergedParts
    .map((part) => token.slice(part.start, part.end))
    .join(' ');
}

function shouldSkipConPTYDecompression(line = '') {
  if (!line) return false;
  if (/[{}\[\]]/.test(line)) return true;
  if (/^[A-Z_]+=/.test(line)) return true;
  if (/^\s*\w+\s*:\s*[{[]/.test(line)) return true;
  if (/^\s*[-*]/.test(line) && /\/api\//.test(line)) return true;
  if (/https?:\/\//.test(line)) return true;
  if (/PROMPT-CONTROL-REPORT/.test(line)) return true;
  if (/^(?:~[\\/]|[A-Za-z]:[\\/])/.test(line)) return true;
  return false;
}

function restoreFragmentedChatSequence(sequence = '') {
  const raw = String(sequence ?? '').trim();
  if (!raw.includes(' ')) return raw;

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return raw;
  if (!parts.every((part) => /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}$/u.test(part))) return raw;

  const singleCharCount = parts.filter((part) => part.length === 1).length;
  const shortPartCount = parts.filter((part) => part.length <= 2).length;
  const maxPartLen = Math.max(...parts.map((p) => p.length));

  // Check if merged form is a known word before bailing out
  const merged = parts.join('');
  const normalizedMerged = normalizeCompressedChatWord(merged);
  if (CHAT_WORD_SET.has(normalizedMerged)) return merged;

  // If no single-char fragments AND no short-part majority, keep original
  if (singleCharCount === 0 && shortPartCount < parts.length / 2) return raw;

  // If every fragment is already a known word AND none are single-char fragments
  // that look like token-boundary artifacts, keep the original spacing.
  const knownParts = parts.filter((part) => CHAT_WORD_SET.has(normalizeCompressedChatWord(part))).length;
  if (knownParts === parts.length) return raw;

  // Long words (>5 chars) next to single-char connectors are real sentence tokens,
  // not BPE fragments. Return original when the long parts dominate.
  const singleCharConnectors = new Set(['a', 'e', 'i', 'o', 'è']);
  const longParts = parts.filter((p) => p.length > 5);
  const connectorSingles = parts.filter((p) => p.length === 1 && singleCharConnectors.has(p.toLowerCase()));
  if (longParts.length >= 1 && connectorSingles.length === singleCharCount && maxPartLen >= 5) return raw;

  if (merged.length < 4) return raw;

  // For short merged forms (< 7 chars) that restoreCompressedChatToken would skip,
  // do a direct dictionary prefix scan to find known word boundaries.
  if (merged.length < 7) {
    const normalizedMergedFull = normalizeCompressedChatWord(merged);
    for (let prefixLen = 2; prefixLen < normalizedMergedFull.length; prefixLen += 1) {
      const prefix = normalizedMergedFull.slice(0, prefixLen);
      const suffix = normalizedMergedFull.slice(prefixLen);
      if (CHAT_WORD_SET.has(prefix) && (CHAT_WORD_SET.has(suffix) || suffix.length <= 1)) {
        return merged.slice(0, prefixLen) + (suffix.length > 0 ? ' ' + merged.slice(prefixLen) : '');
      }
    }
    return raw;
  }

  const restored = restoreCompressedChatToken(merged);
  if (restored !== merged) return restored;
  return raw;
}

function stripLeadingCorruption(line = '') {
  const raw = String(line ?? '');
  if (raw.length < 24) return raw;

  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length < 5) return raw;

  for (let startIndex = 3; startIndex <= Math.min(8, tokens.length - 3); startIndex += 1) {
    const prefixTokens = tokens.slice(0, startIndex);
    const remainingTokens = tokens.slice(startIndex);
    if (remainingTokens.length < 3) break;

    const shortPrefixTokens = prefixTokens.filter((token) => token.length <= 2).length;
    const hasDigits = prefixTokens.some((token) => /\d/.test(token));
    const hasSymbols = prefixTokens.some((token) => /[^\p{L}\p{N}]/u.test(token));
    const alphaCorePrefixTokens = prefixTokens.map((token) => String(token).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
    const naturalPrefixWords = alphaCorePrefixTokens.filter((token) => /^[A-Za-z\u00C0-\u00FF]{3,}$/u.test(token)).length;
    const naturalPrefixPunctuation = prefixTokens.filter((token) => /[,.!?;:]/.test(token)).length;
    const mostlyShortPrefix = shortPrefixTokens >= Math.max(3, prefixTokens.length - 1);
    if (!hasDigits && !hasSymbols && !mostlyShortPrefix) continue;
    if (!hasDigits && naturalPrefixWords >= 2) continue;
    if (!hasDigits && naturalPrefixWords >= 1 && naturalPrefixPunctuation >= 1 && !mostlyShortPrefix) continue;

    const firstToken = remainingTokens[0] ?? '';
    const secondToken = remainingTokens[1] ?? '';
    const readableStart = LEADING_CHAT_CONNECTORS.has(normalizeCompressedChatWord(firstToken))
      ? isReadableChatToken(secondToken)
      : isReadableChatToken(firstToken);
    if (!readableStart) continue;

    const readableSample = remainingTokens.slice(0, 5).filter(isReadableChatToken).length;
    if (readableSample < 3) continue;

    return remainingTokens.join(' ');
  }

  return raw;
}

function mergeBpeFragmentsIfKnown(sequence = '') {
  const parts = sequence.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return sequence;

  const merged = parts.join('');
  const normalizedMerged = normalizeCompressedChatWord(merged);
  if (CHAT_WORD_SET.has(normalizedMerged)) return merged;

  if (parts.length >= 3) {
    for (let windowSize = parts.length; windowSize >= 2; windowSize -= 1) {
      for (let start = 0; start <= parts.length - windowSize; start += 1) {
        const window = parts.slice(start, start + windowSize);
        const windowMerged = window.join('');
        if (CHAT_WORD_SET.has(normalizeCompressedChatWord(windowMerged))) {
          const result = [
            ...parts.slice(0, start),
            windowMerged,
            ...parts.slice(start + windowSize),
          ];
          return result.join(' ');
        }
      }
    }
  }

  return sequence;
}

export function normalizeChatDisplayText(text = '', { streamJson = false } = {}) {
  if (!text) return text;

  const _result = String(text)
    .split('\n')
    .map((line) => {
      if (shouldSkipConPTYDecompression(line)) return (streamJson ? line : stripLeadingCorruption(line)).trimEnd();

      // Stream-json text is already clean from the Claude API — skip all ConPTY
      // decompression which corrupts accented characters and valid words (DEC-030).
      if (streamJson) {
        return line
          .replace(/([.!?])([A-Z\u00C0-\u00D6])/gu, '$1 $2')
          .replace(/([,;])([a-zA-Z\u00C0-\u00F6])/gu, '$1 $2')
          .replace(/([a-z\u00E0-\u00F6])(?=[A-Z\u00C0-\u00D6][a-z\u00E0-\u00F6]{2,})/gu, '$1 ')
          .replace(/\s{2,}/g, ' ')
          .trimEnd();
      }

      let processed = line
        .replace(/\b[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1}\s+(?:[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}\s+){1,4}[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}\b/gu, (sequence) => restoreFragmentedChatSequence(sequence))
          .replace(/\b[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}\s+[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1}(?:\s+[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}){0,2}\b/gu, (sequence) => restoreFragmentedChatSequence(sequence))
          .replace(/\b[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{2,6}(?:\s+[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{2,6}){1,4}\b/gu, (sequence) => mergeBpeFragmentsIfKnown(sequence));
      processed = processed.replace(/\b[A-Za-z\u00C0-\u00FF]{18,}\b/gu, (token) => aggressivelyRestoreLongChatToken(token))
          .replace(/\b([A-Z\u00C0-\u00D6])\s+([a-z\u00E0-\u00F6]{2,})\b/gu, (m, cap, rest) => {
            const merged = cap + rest;
            return CHAT_WORD_SET.has(normalizeCompressedChatWord(merged)) ? merged : m;
          })
          .replace(/\b(del|nel|al|sul|dal)\s+l([''])/gu, (_, base, apo) => {
            const doubled = base === 'al' ? 'all' : base.slice(0, -1) + 'll';
            return doubled + apo;
          })
          .replace(/([.!?])([A-Z\u00C0-\u00D6])/gu, '$1 $2')
          .replace(/([,;])([a-zA-Z\u00C0-\u00F6])/gu, '$1 $2')
          .replace(/([):])([A-Z\u00C0-\u00D6])/gu, '$1 $2')
          .replace(/([a-z\u00E0-\u00F6])(?=[A-Z\u00C0-\u00D6][a-z\u00E0-\u00F6]{2,})/gu, '$1 ');
      processed = processed.replace(/\b([A-Za-z\u00C0-\u00F6]{2,})(è)(?=\s|[,;:.!?]|$)/gu, (m, prefix, e) => {
            return CHAT_WORD_SET.has(normalizeCompressedChatWord(m)) ? m : prefix + ' ' + e;
          });
      processed = processed.replace(/([a-zA-Z\u00C0-\u00F6])(\d)/gu, '$1 $2')
          .replace(/(\d)([a-zA-Z\u00C0-\u00F6])/gu, '$1 $2')
          .replace(/\b([a-zA-Z\u00C0-\u00F6]+(?:[‘’](?:s|re|ve|ll|d|m)|n[‘’]t))(?=[a-zA-Z\u00C0-\u00F6])/gu, '$1 ')
          .replace(/\b([a-zA-Z\u00C0-\u00F6]+['’])([a-zA-Z\u00C0-\u00F6]{7,})/gu, (_, prefix, suffix) => `${prefix}${restoreCompressedChatToken(suffix)}`)
          .replace(RESTORABLE_CHAT_TOKEN_MATCH_RE, (token) => restoreCompressedChatToken(token));
      processed = processed.replace(/\s{2,}/g, ' ');
      return stripLeadingCorruption(processed).trimEnd();
    })
    .join('\n');

  return _result;
}
