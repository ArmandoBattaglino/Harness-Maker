Claude Code Visual Manager v3: The Swarm Orchestrator (PRD)
Project Name: Visual Manager v3 / Swarm UI Status: DRAFT - CONSOLIDATED | Last Updated: 27 Marzo 2026

Questo documento rappresenta la Single Source of Truth (SSOT) per lo sviluppo della Versione 3. Raccoglie la visione di prodotto, i requisiti utente estratti da 1.000 simulazioni d'intervista, e le direttive architetturali per evolvere l'applicazione da un semplice "Terminale di Programmazione" a un Orchestratore Aziendale Universale Multi-Agente.

1. Visione di Prodotto (Il Pivot "Swarm")
L'obiettivo della v3 non è più solo interfacciarsi con il codice, ma offrire un'Interfaccia Grafica (GUI) per OpenAI Swarm. Gli utenti utilizzeranno l'app per orchestrare intere "Aziende in miniatura" (Servizio Clienti, Analisi Dati, Legale, Sviluppo).

Cos'è il Pattern Swarm (Come funziona davvero)
A differenza dei vecchi workflow rigidi e lineari ("Fa X, poi Y, poi Z"), Swarm si basa su deleghe intelligenti:

Agents (Agenti Specializzati): Entità iper-focalizzate definite da Istruzioni (es. "Sei un valutatore di rimborsi") e Tools (funzioni JS/Python come "Leggi Database" o "Invia Rifiuto").
Handoffs (Passaggi di Consegne): È la magia di Swarm. Se un utente scrive "Ho un problema col login", l'Agente Principale (il Router) analizza la frase e usa un Tool chiamato transfer_to_tech_agent(). Questo blocca il Router e passa l'intera conversazione e i poteri esecutivi (Handoff) all'Agente Tech. Se l'Agente Tech risolve, l'Agente Tech stesso restituisce la risposta direttamente all'utente. Non è un "tubo", è una ragnatela viva e decisionale.
Prompt-to-Flow (Generazione Procedurale dei Nodi): L'utente non è obbligato a trascinare i blocchi manualmente. Al centro della Canvas vuota ci sarà un Global Prompt Input. Se l'utente digita "Creami un dipartimento marketing per un e-commerce", la nostra app:
Contatta un LLM in background passandogli lo schema JSON desiderato dei nostri nodi.
Piatta sulla Canvas, in tempo reale, un org-chart completo prepopolato (es. un Manager Marketing connesso a un Copywriter, un SEO Specialist e un Social Poster), ciascuno con il proprio System Prompt e i Tools già configurati. L'utente ottiene la "base" generata dall'IA, che può poi affinare visivamente.
L'Organigramma Aziendale (Non un semplice Workflow)
L'evoluzione suprema della nostra UI non è permettere di disegnare un "diagramma di flusso", ma permettere di disegnare un Organigramma Aziendale. L'utente, senza saper programmare, crea veri e propri dipartimenti virtuali popolati da Agenti con una Personalità e una Memoria Isolata.

La classificazione gerarchica degli Agenti che l'utente può inserire nella Canvas:

Executive Agents (CEO / Direttori): Agenti di altissimo livello. Non fanno lavoro pratico. Leggono l'obiettivo enorme dell'umano, delineano la strategia, e usano il tool handoff_to_department per svegliare i manager intermedi.
Department Manager Agents: Es. Capo Reparto Marketing o Lead QA. Hanno accesso alla memoria del loro specifico dipartimento. Sanno quali risorse e Agenti Operai hanno sotto di loro. Smistano i sub-task ricevuti dal Direttore ai singoli operai e supervisionano i risultati.
Worker Agents (Gli Operai): Svolgono il lavoro manuale pesante e ultra-specializzato (es. Database Engineer Agent o SEO Copywriter Agent). Hanno una "Personalità" focalizzata a fare una sola cosa perfettamente. Hanno i Tools fisici (SQL Query, Write File, API Call) e riportano al loro Manager a fine lavoro.
L'Isolamento della Memoria: A differenza delle normali chat LLM dove il modello sa tutto di tutto (e per questo allucina), in questo Organigramma la memoria è stagna. Il Worker Agent del Database non sa nulla del piano di Marketing del CEO, sa solo che il suo Manager gli ha chiesto di estrarre 10 righe. Questa "ignoranza compartimentalizzata" è ciò che garantisce risultati di livello enterprise e azzera le allucinazioni IA.
2. Traduzione UI / UX (Come lo usa il cliente)
L'interfaccia utente tradurrà concetti complessi in "Nodi" visivi, utilizzando React Flow per la Canvas.

Il Canvas (Workflow Editor)
Nodi = Agenti Swarm: Trascinando un quadrato sulla griglia inizia la creazione di un Agente. Cliccando il nodo si apre un Inspector lato destro permettendo all'utente di definire:
System Prompt (Es. "Sei il Triage Agent, analizza la dashboard").
Tools (Checkbox per abitarlo a: "Leggi File", "Usa API Esterna", ecc.).
Modello LLM (Possibilità di usare modelli economici come Haiku per il Triage, e Sonnet per compiti complessi).
Frecce = Handoffs Logici: Quando l'utente traccia un filo d'unione tra l'Agente A e l'Agente B, il backend Nod.js compila segretamente una funzione (Tool) nell'Agente A permettendogli di attivare in autonomia il passaggio all'Agente B in base alla necessità contestuale.
3. Simulazioni UX & Casi d'Uso Chiave
Per visualizzare esattamente come l'utente interagisca con la piattaforma, abbiamo definito due User Journeys primari.

Simulazione UX 1: "Prompt-to-Company" (Creazione Dipartimento Marketing)
L'utente è Leo, un Founder non tecnico che deve lanciare un blog per il suo e-commerce.

Atterraggio: Leo apre la tab [Workflows]. Vede una grande Canvas a punti neri vuota. Al centro c'è una barra di ricerca luminosa: "Di cosa hai bisogno oggi?"
Generazione: Leo digita: "Costruisci un dipartimento Marketing. Deve analizzare i trend di X (Twitter) sul fitness, scrivere un articolo Blog SEO e poi postare 3 Tweet per promuoverlo." Preme Invio.
Lo Spettacolo Visivo: Uno scheletro di caricamento ("Scaffolding AI...") appare per 4 secondi. Subito dopo, sulla Canvas si "stampano" 4 Nodi colorati già cablati tra loro:
[CEO Router] → Collegato a [Trend Analyst], [SEO Copywriter], e [Social Poster].
Ispezione (L'A-Ha Moment): Leo non tocca nulla. Clicca solo sul nodo Social Poster. A destra si apre l'Inspector. Leo vede che l'IA ha già inserito il System Prompt: "Sei il Social Media Manager..." e ha attivato automaticamente il Tool Interagisci col File System (per salvare i tweet).
Esecuzione: Leo imposta un Budget Limit di $2.00 in alto a destra. Preme il bottone verde gigante [▶ Avvia Azienda].
I Log Animati: Il nodo CEO Router lampeggia di azzurro. Al suo interno, scritte microscopiche da terminale scorrono velocemente. Dopo 30 secondi, il colore azzurro "scivola" lungo il filo fino al Trend Analyst. La catena è partita da sola.
Simulazione UX 2: "Il Watchdog Notturno" (Debugging Asincrono)
L'utente è Anna, una sistemista che vuole automatizzare i bug server notturni.

Setup: Anna non usa il prompt testuale. Apre una Canvas vuota e trascina dal menu laterale il "Webhook Trigger Node". Lo configura affinché reagisca quando Sentry.io manda un avviso.
Costruzione Logica: Lega questo Trigger a un Nodo Emergency Router. Collega questo Router a un NodeJS Bugfixer Agent (con il tool Read/Write Files attivo) e a un Git Approver Agent (con il tool Creare Pull Request attivo).
Il Risveglio: Alle 4 del mattino, arriva l'errore 500 su Sentry. L'utente dorme. Il webhook sveglia la WebApp in background.
Handoff Logico: Il Emergency Router analizza lo Stacktrace JSON di Sentry arrivato nel Trigger. Capisce che l'errore è nel server backend. Sputa nello stdout da comando: transfer_to_NodeJS_Bugfixer(error_data). Il nostro server SwarmEngine intercetta, mette in pausa il router, e accende il Bugfixer.
Human Fallback (Pausa mattutina): Alle 8:00 Anna si sveglia, apre il Visual Manager. Vede il workflow in PAUSA (colore Arancione). Il nodo finale ha richiesto la sua attenzione prima di fare git push a produzione. Anna clicca [🔍 Review Diff], controlla la patch scritta dall'Agente di notte, preme Approva. Il sito è salvo.
4. Next Steps Architetturali
Per iniziare l'MVP (Minimum Viable Product) su questa v3, inizieremo da:

Sviluppo di <SwarmCanvas.jsx> in frontend (installando react-flow-renderer). Disegnare Rettangoli (Agenti) e Frecce (Handoff Functions).
Sviluppo del motore d'esecuzione server/services/SwarmEngine.js. Il vero punto di svolta tecnico: Il backend NON farà semplici chiamate API raw ad Anthropic per far funzionare gli agenti. Invece, per ogni Agente istanziato, il server forkerà un Micro-Terminale dedicato (node-pty) che esegue la CLI nativa ufficiale claude.
Vantaggio: Ogni "Agente" del nostro dipartimento aziendale è una vera iterazione autonoma di Claude Code CLI, ereditandone i Tools nativi (Bash, File Write, MCP Servers).
L'Orchestrazione (Handoff): Il nostro JS Server farà da "Puppeteer" di queste istanze terminale. Leggerà l'output di testo generato dalla CLI di turno; se Claude stampa un comando speciale di Handoff, il Server metterà in pausa quel PTY e sveglierà l'istanza PTY successiva passandole il contesto.
Definizione dei Core Tools: Trattandosi di un Wrapper per la CLI nativa, non dovremo reinventare la ruota per fargli scrivere file. L'utente, nella UI, potrà configurare quali "MCP Servers" collegare a quale singola istanza PTY, dando ai vari reparti poteri estremamente specifici.
(Nota: Le feature di "Vision UI Tester" e "Dynamic Context Injection / RAG" sono state posticipate per focalizzare il 100% dell'MVP sull'Agnosticismo del Motore Swarm).

5. UX/UI Brainstorming Log (In Progress)
(Questa sezione raccoglie le decisioni architetturali di User Experience prese in tempo reale tramite simulazioni e Q&A concettuali con gli stakeholder).

Q1: La Geometria dell'App (Mappa vs Chat) Domanda: Durante l'esecuzione, l'interfaccia deve restare una mappa a nodi (fabbrica) in cui l'utente spia i quadratini, o deve rimpicciolirsi per mostrare un classico Feed di Chat globale stile WhatsApp aziendale? Decisione (Il "Command Center" Ibrido Interattivo): L'utente ha definito una visione ibrida profondamente avanzata che mescola l'Opzione 1 (Mappa) e l'Opzione 2 (Feed Globale), elevando l'interfaccia da un semplice visore passivo a un Mete-Terminale di Comando.

Le direttive UX specifiche imposte dall'utente sono:

La Base Visiva (La Mappa come Monitoraggio): L'infrastruttura di base resta visiva. L'utente guarda dall'alto l'organigramma aziendale, vedendo i nodi lampeggiare o accendersi quando si passano il task.
Trasparenza del Dialogo (Inter-Agent Chatter): Oltre ai lampeggiamenti, l'utente deve poter leggere in tempo reale cosa si dicono gli agenti tra di loro. Questo avviene tramite un Feed testuale globale scorrevole integrato a lato della mappa.
Esplosione del Nodo (Controllo Diretto PTY): Il grande elemento di innovazione. Se l'utente clicca su un singolo Agente sulla mappa, esplode a schermo l'istanza terminale dedicata di quell'Agente (il suo sub-process claude CLI). L'utente può letteralmente vedere il cursore dell'agente che batte o che aspetta.
Intervento Umano in Corsa (Live Injection): Entrando nel terminale di un agente in esecuzione, l'utente può interagire scrivendo cose nel terminale testuale. Può fermarlo temporaneamente per dirgli: "Aspetta, lascia stare l'API di Twitter, fai questo file invece", assumendo il controllo manuale dell'istanza e poi ridando Invio per far ripartire l'automazione.
Comunicazione Top-Down (Broadcast per Dipartimento): L'utente, dal pannello globale, ha una casella di testo per mandare un messaggio a "TUTTA LA STANZA". Può inviare direttive a specifici Singoli Agenti oppure mandare messaggi a macchia d'olio a interi Dipartimenti (es. selezionando "Dipartimento Marketing" e scrivendo: "Da ora usiamo un tono ironico"). Tutti i PTY degli agenti in quel dipartimento riceveranno quell'input simultaneamente come nuova istruzione di sistema nel loro prompt.
Q2: L'Equipaggiamento dei Tools (Lo 'Zaino') Domanda: Per dare a un Agente la capacità di usare il File System o le API di Stripe, l'utente dovrebbe trascinare un'icona (es. un martello o uno zaino) FISICAMENTE sopra il nodo dell'Agente, oppure cliccare l'agente e spuntare delle noiose checkbox in un pannello di destra (Inspector)? Decisione (NLP-Driven Visual Crafting): L'utente ha fuso la matericità dell'Opzione 2 (Drag & Drop visivo) con la profondità dell'Opzione 5 (Skill Tree), governando il tutto tramite l'Intelligenza Artificiale (Opzione 3).

L'Arsenale Completo: L'utente ha a disposizione tutte le skill e i tool possibili. Se clicca su un agente, si apre un bellissimo "Skill Tree" (Albero delle Abilità) dove può bilanciare le statistiche dell'agente, iniettare frammenti di Memoria Permanente e sbloccare Tools specifici.
La Magia del Prompt-to-Craft: La vera UX rivoluzionaria è che l'utente non deve per forza cliccare. Può semplicemente aprire la barra di testo globale e scrivere: "Assegna al Copywriter la capacità di navigare in internet, dagli una memoria ferrea sui nostri vecchi articoli, e rendilo ultra-creativo". Il nostro frontend parserà questo NLP e lo tradurrà in animazioni visive: l'utente vedrà fisicamente l'icona del "Mappamondo" (Internet Tool) volare dentro lo zaino dell'Agente, lo Skill Tree aprirsi da solo per impostare il parametro Creatività: 90/100, e la Memoria iniettata nel suo database interno. È una forgiatura visibile e appagante.
Q3: Handoff Visivi e Loop di Correzione (I 'Litigi') Domanda: Se il Checker Agent trova un bug nel codice del Coder Agent e glielo rimanda indietro 15 volte di fila, come lo mostriamo? Formichine veloci che fanno avanti e indietro sul filo di collegamento, oppure un contatore (Iterazioni: 15) colorandosi di rosso fuoco per indicare stress dell'API? Decisione (Il Guardiano Silenzioso): L'utente ha selezionato l'Opzione 5 per mantenere la UI estremamente pulita e professionale, evitando le distrazioni tipiche dei giocattoli estetici.

Nessuna distrazione visiva: Quando due Agenti entrano in un loop di correzione continuo (es. Dev contro QA), non ci sono animazioni pacchiane. Appare semplicemente un piccolo badge elegante sul filo di connessione con un contatore aggiornato live (es. [x3], [x4]).
Il "Circuit Breaker" Umano: Se il contatore raggiunge una soglia critica definita (es. [x10]), l'applicazione disinnesca il loop automaticamente per salvare il budget API dell'utente. Il filo diventa Arancione (Stato di Pausa) e il sistema lancia un avviso globale. L'umano è costretto ad aprire il Conflict Log, leggere il litigio testuale tra i due agenti e prendere una decisione dirimente per sbloccare i lavori.
Q4: L'Astrazione e lo Zoom (Micro vs Macro) Domanda: Se l'utente crea una mega-azienda con 50 agenti, la Canvas diventa un incubo visivo. Preferisci un approccio "Esploso" (clicchi sul nodo grosso "Marketing" e ti fa entrare in una sotto-canvas con i 5 agenti specifici) oppure una tela infinita stile Miro in cui il mouse vola tra i dipartimenti? Decisione (Le Matrioske Aziendali): L'utente ha selezionato l'Opzione 2. La filosofia UI si baserà sul concetto gerarchico di "Cartelle Spaziali".

La vista Main Board: L'utente visualizza inizialmente solo i blocchi giganteschi dei "Dipartimenti" (es. Reparto Sviluppo, Reparto Marketing). Questo mantiene pulito lo schermo.
Il Drill-Down (Immersione): Facendo doppio click sul nodo di un Dipartimento, l'interfaccia "zooma dentro" il nodo. La Canvas si resetta e mostra il contenuto di quel dipartimento.
Infinita Scalabilità: Il vantaggio di questa scelta è poter creare Dipartimenti dentro i Dipartimenti (es. Dentro il Reparto Sviluppo, trovi i sottonodi "Frontend" e "Backend", e dentro Frontend trovi gli agenti reali). L'utente navigherà l'azienda con un breadcrumb in alto a sinistra (es. Acme Corp > Sviluppo > Frontend > Coder React). Questo risolve totalmente il disordine visivo, anche con 1000 agenti attivi.
Q5: Il Rientro Umano (Human-in-the-Loop) Domanda: Quando il sistema si ferma perché serve l'approvazione umana per un Push su Git, l'Agente deve far vibrare o lampeggiare lo schermo, inviare una notifica push del SO, o oscurare tutta l'App forzando l'utente a gestire il blocco come un PopUp non ignorabile? Decisione (La Inbox Dual-Mode): L'utente ha definito un sistema avanzato basato sull'Opzione 4 (La Inbox a Scomparsa), ma potenziato da un interruttore globale: [Auto-Pilot] vs [Human-in-the-Loop].

Modalità Auto-Pilot (Asincrona): L'utente accende la macchina ed esce di casa. Gli agenti non si fermano mai. Se trovano un blocco (es. un server down o un errore irrisolvibile dopo 10 loop), registrano una nota dettagliata su cosa è andato storto, la inviano alla Inbox, e passano al branch di codice successivo o al task seguente. Quando l'utente torna a casa, apre l'App e trova la Inbox piena di Report (es. gialli per warning, rossi per task falliti) che può leggere a mente fredda come un post-mortem.
Modalità HITL (Bloccante): Se l'umano è alla scrivania, attiva l'HITL. Ora la Inbox diventa un Command Center in tempo reale. Se un Agente richiede un'approvazione esterna, il nodo si freeza, e una notifica colorata cade nella Inbox inferiore. L'utente apre la Inbox, analizza la richiesta dell'agente, e clicca "Approva" o "Rifiuta", sbloccando istantaneamente il terminale PTY dell'agente.
Q6: Trigger Iniziali (Non testuali) Domanda: Se il Workflow non parte da un "Prompt", ma parte da una Mail su Gmail in arrivo. Il nodo "Gmail" deve essere disegnato uguale agli Agenti (ma di un altro colore) o deve essere posizionato in un pannello super-alto da cui "piovono" i dati verso l'org-chart? Decisione (I Socket Multipli Procedurali): L'utente ha optato per un ibrido magistrale tra l'Opzione 1 (Blocchi Fisici visibili) e l'Opzione 5 (Socket Laterali distribuiti).

Le Spine (Sockets): Non esiste un unico punto di ingresso all'Azienda. Ogni Dipartimento o singolo Agente ha delle "prese" sul suo lato sinistro. L'utente ha a disposizione dei Nodi Trigger fisici squadrati (es. icona Verde di Gmail, icona Viola di Stripe) che può letteralmente "agganciare" a queste prese. Un dipartimento può accendersi in base a 4 trigger diversi simultaneamente.
La Vera Rivoluzione (Prompt-to-Trigger): In linea con il vantaggio competitivo estremo della piattaforma, l'utente non è costretto a navigare la libreria dei trigger. Cliccherà sulla barra spaziale globale e digiterà: "Fai partire questo agente ogni volta che ricevo un pagamento su Stripe". L'A.I. in background genererà il Nodo Trigger Stripe configurato, e l'utente lo vedrà apparire sullo schermo e "sganciarsi" automaticamente nella presa corretta dell'Agente con un'animazione fluida. L'automazione estrema si costruisce usando la pura parola.
6. Master User Journey (The End-to-End Experience)
Questa narrativa unisce tutte le 6 decisioni UX in un'unica, fluida interazione "Giornata-Tipo" per mostrare la potenza dell'applicazione.

Attore: Marco, proprietario di un'agenzia Web. Vuole creare una catena di montaggio che traduca e riscriva gli articoli del blog dei suoi competitor, postandoli sul suo sito.

Fase 1: La Creazione Spaziale (Q6 + Prompt-to-Workbench)

Marco apre l'App. La schermata è una griglia vuota. Al centro, la omni-search: "Di cosa hai bisogno oggi?"
Digita: "Crea un'Agenzia di Traduzione. Deve accendersi ogni volta che esce un feed RSS da TheVerge. Passa il testo a un Traduttore, poi a un Copywriter Creativo, poi a un Revisore, e infine salvalo in locale."
Magia Visiva: Lo schermo traccia i percorsi. Appare un blocco RSS arancione (Trigger) che si incastra nella presa sinistra di un enorme Nodo Cartella chiamato Agenzia Traduzioni.
Fase 2: Immersione e Bilanciamento (Q4 + Q2) 4. Marco, intrigato, fa doppio clic sulla grande cartella Agenzia Traduzioni (Approccio Matrioska). 5. Lo schermo zooma istantaneamente "dentro" la cartella, rivelando i 3 Agenti creati dall'A.I.: Traduttore → Copywriter → Revisore. In alto compare la breadcrumb Home > Agenzia Traduzioni. 6. Marco clicca sul Copywriter. Si apre lateralmente lo Skill Tree. Marco alza il parametro Creatività a 90/100. 7. Si accorge che il Copywriter non sa navigare in internet per cercare le fonti. Marco afferra l'icona 3D [Mappamondo / Search Tool] e la trascina fisicamente sopra il quadrato del Copywriter. Un'animazione conferma che il tool è equipaggiato con successo.

Fase 3: Esecuzione e Command Center (Q1) 8. Marco preme ▶ AVVIA STANDBY. Quando arriva l'RSS reale, la linea tra Trigger e Traduttore si illumina di giallo. 9. Dal Feed Globale a destra, Marco vede i messaggi che gli agenti si scambiano. Legge il Copywriter dire: "Ecco l'articolo formattato, passo al revisore". 10. Marco nota che il Copywriter ha usato troppe emoticon. Decide di "hackerare" l'agente. Clicca direttamente sul nodo del Copywriter. 11. Lo schermo lancia un'istanza Terminale PTY in tempo reale. Marco vede l'Agente che aspetta. Marco scrive direttamente nella console: "Fermati, rimuovi le emoticon dal testo appena generato." L'agente risponde testualmente, applica la correzione e poi il workflow riprende.

Fase 4: Il Loop e il Rientro Umano (Q3 + Q5) 12. Il Copywriter passa il nuovo pezzo al Revisore. Il Revisore trova dei refusi e glielo rimanda indietro. Iniziano a litigare. Il filo di collegamento non fa effetti esagerati. Spunta solo un piccolo badge pulito: [x1], poi [x2], poi [x3]. 13. Al raggiungimento di [x5], scatta il Guardiano Silenzioso. Per evitare sprechi enormi di API, l'App mette in pausa l'intera "Agenzia Traduzioni". 14. Marco (che aveva la modalità Human-in-the-Loop attivata a "Bloccante") vede comparire una Inbox elegante dal basso dello schermo. La notifica recita: "Conflitto irreparabile tra Copywriter e Revisore. Richiesta Approvazione Umana". 15. Marco apre la Inbox (Conflict Log), legge in 5 secondi il motivo del litigio, preme [FORZA APPROVAZIONE] e sblocca l'impasse. Il sistema conclude il ciclo e salva il file perfetto in locale.

Risultato: Marco ha sostituito 3 dipendenti umani creando un software autonomo, bilanciandolo come in un videogioco, intervenendo in tempo reale come da una cabina di regia e usando la punteggiatura del linguaggio naturale per generare codice e logica complessa.