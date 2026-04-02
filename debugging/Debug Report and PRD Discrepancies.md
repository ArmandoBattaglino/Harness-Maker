REPORT BUG & DISCREPANZE PRD — Sezione Swarm

  Test Eseguiti: 38 test PRD-specifici + 20 test funzionali precedenti

  ---
  BUG REALI (funzionalita' che non funziona come dovrebbe)

  BUG-1: HITL Reject NON inietta messaggio di rifiuto nel PTY

  - PRD Reference: FR-V3-30
  - Specifica: "On reject, a rejection message must be injected"
  - Comportamento Attuale: Il reject handler (inbox.js:97-125) rimuove l'item dall'inbox e broadcast hitl_resolved con decision: 'rejected', ma NON inietta alcun messaggio nel PTY dell'agente. L'agent rimane
  frozen in stato 'paused' senza ricevere alcuna notifica.
  - Severita: MEDIA — L'agente resta bloccato dopo un reject senza possibilita' di ripresa
  - File: server/routes/inbox.js:97-125
  - Fix Necessario: Aggiungere writeInput(sessionId, 'REJECTED: ...\n') e chiamare unfreezeAgent() (o un equivalente) nel reject handler

  ---
  BUG-2: BroadcastBar UI manca il selettore di scope (department/agent)

  - PRD Reference: FR-V3-36
  - Specifica: "The BroadcastBar UI component must allow the user to type a message and select scope (All Agents / Department / Specific Agent) before sending"
  - Comportamento Attuale: Il BroadcastBar ha un selettore per mode (soft/hard) ma scope e' sempre hardcoded a 'all' (riga 29: scope: 'all'). Non c'e' nessun dropdown per selezionare department o agent
  specifico.
  - Severita: MEDIA — L'utente non puo' targettizzare un singolo agente o department dal UI
  - File: client/src/canvas/BroadcastBar.jsx:29
  - Fix Necessario: Aggiungere un <select> per scope con opzioni "All", departments e singoli agenti

  ---
  BUG-3: Scaffold response NON e' SSE streamed

  - PRD Reference: FR-V3-19 (Section 9)
  - Specifica: "Response: WorkflowDefinition (streamed via SSE)"
  - Comportamento Attuale: POST /scaffold ritorna una risposta JSON sincrona (res.status(201).json(...)) — nessun SSE streaming. L'utente non vede progresso durante la generazione.
  - Severita: BASSA — Funziona ma l'UX e' peggiore del previsto (nessun feedback durante generazione)
  - File: server/routes/swarm.js:156

  ---
  BUG-4: Prompt-to-Flow manca l'animazione stagger 80ms per nodo

  - PRD Reference: FR-V3-20
  - Specifica: "Animate each new node onto the canvas with an 80ms staggered delay per node"
  - Comportamento Attuale: Il PromptToFlowBar crea un animatedDef ma non implementa alcun delay stagger. I nodi appaiono tutti simultaneamente quando il workflow viene impostato nello store.
  - Severita: BASSA — Cosmetico, non funzionale
  - File: client/src/canvas/PromptToFlowBar.jsx:36-43

  ---
  BUG-5: lastOutputSnippet NON incluso negli eventi WS agent_status

  - PRD Reference: PRD Section 9 ({ type: "agent_status", nodeId, status, lastOutputSnippet })
  - Specifica: L'evento agent_status dovrebbe includere lastOutputSnippet
  - Comportamento Attuale: L'evento include { type, nodeId, status, sessionId } ma mai lastOutputSnippet. Il frontend mostra il snippet SOLO se il client fetcha manualmente /status, non via WS real-time.
  - Severita: MEDIA — Il micro-log PTY nell'AgentNode non si aggiorna in tempo reale via WS
  - File: server/services/SwarmEngine.js (tutte le righe che emettono agent_status)
  - Impatto Client: AgentNode.jsx legge agentState.lastOutputSnippet dallo store, ma questo campo non viene mai aggiornato tramite WS

  ---
  BUG-6: Inbox API path discrepante dal PRD

  - PRD Reference: FR-V3-29 (Section 9)
  - Specifica PRD: GET /api/v1/inbox, POST /api/v1/inbox/:itemId/approve, POST /api/v1/inbox/:itemId/reject
  - Implementazione Attuale: GET /api/v1/swarm/:executionId/inbox, POST /api/v1/swarm/:executionId/inbox/:itemId/approve, POST /api/v1/swarm/:executionId/inbox/:itemId/reject
  - Severita: BASSA — L'implementazione e' funzionalmente corretta e forse migliore del PRD (include executionId nel path), ma non rispetta le specifiche

  ---
  BUG-7: Hard mode injection sequence diverge dalla specifica

  - PRD Reference: FR-V3-33
  - Specifica: \x03 (Ctrl+C) + 300ms + text + \x1b + \r
  - Comportamento Attuale: \x03 + 300ms + text + \x1b + 100ms + \n
  - Differenza: Usa \n (newline) invece di \r (carriage return), e aggiunge un delay extra di 100ms tra ESC e newline
  - Severita: BASSA — Potrebbe non funzionare identicamente con Ink su tutte le piattaforme
  - File: server/routes/swarm.js:372-378

  ---
  BUG-8: Soft mode injection sequence diverge dalla specifica

  - PRD Reference: FR-V3-33
  - Specifica: Soft injection dovrebbe accodare il testo senza interrompere
  - Comportamento Attuale: Invia text + '\x1b\n' — usa \n (newline) invece di \r (CR). La specifica Ink-compatible richiede \r.
  - Severita: BASSA — Potrebbe non submitare correttamente in Ink
  - File: server/routes/swarm.js:368

  ---
  DISCREPANZE PRD (implementazione diversa, ma funzionante)

  DISC-1: HandoffParser — regex vs FSM

  - PRD FR-V3-14: "three-state FSM: SCANNING → COLLECTING_TARGET → COLLECTING_PAYLOAD"
  - Attuale: Usa regex-based scanning su rolling buffer. Funziona correttamente (tutti i test passano) ma l'architettura non corrisponde al PRD.

  DISC-2: contextUpdate accetta anche number/boolean, non solo string

  - PRD FR-V3-16: "flat dict, string keys and values only"
  - Attuale: _validateContext() accetta string | number | boolean per i valori. Piu' permissivo del PRD.

  DISC-3: Micro PTY log mostra 4 righe invece di 3

  - PRD FR-V3-26: "last 3 lines of PTY output"
  - Attuale: AgentNode.jsx mostra .slice(-4) — 4 righe. Differenza minima.

  DISC-4: lastOutputSnippet e' 500 chars, non "last 3 lines"

  - PRD Section 8 (AgentRuntime): "lastOutputSnippet: string (last 3 lines)"
  - Attuale: SwarmEngine tronca a ultimi 500 caratteri, non a righe. L'AgentNode poi prende le ultime 4 righe.

  DISC-5: Scaffold body field prompt vs description

  - PRD Section 9: Body ha { description: string }
  - Attuale: Body usa { prompt: string }. Il frontend usa coerentemente prompt.

  DISC-6: pause/resume usano :executionId invece di :workflowId

  - PRD FR-V3-44: POST /api/v1/swarm/:workflowId/pause, POST /api/v1/swarm/:workflowId/resume
  - Attuale: Usano :executionId. Piu' corretto tecnicamente (un workflow puo' avere multiple executions).

  DISC-7: reset() cancella workflowDef

  - PRD Section 11 (SwarmContext): "NOTE: current implementation does reset workflowDef in reset(); confirm desired behavior"
  - Attuale: reset() imposta workflowDef: null. Potrebbe essere voluto (clean slate dopo Stop).

  DISC-8: WS event type hitl_required vs PRD inbox_item

  - PRD Section 9: { type: "inbox_item", item: InboxItem }
  - Attuale: { type: 'hitl_required', nodeId, item }. Client gestisce correttamente hitl_required.

  ---
  BUG PRD DOCUMENTATI COME "KNOWN ISSUES" — STATO ATTUALE

  ┌─────────────────────────────────────────────────────┬─────────┬────────────────────────────────────────────────────────────────┐
  │                   PRD Known Issue                   │  Stato  │                              Note                              │
  ├─────────────────────────────────────────────────────┼─────────┼────────────────────────────────────────────────────────────────┤
  │ agent_status mancava sessionId                      │ RISOLTO │ Ora include sessionId in tutti gli emit                        │
  ├─────────────────────────────────────────────────────┼─────────┼────────────────────────────────────────────────────────────────┤
  │ handoff_completed mai emesso                        │ RISOLTO │ Ora emesso in _onHandoff() (riga 390-395)                      │
  ├─────────────────────────────────────────────────────┼─────────┼────────────────────────────────────────────────────────────────┤
  │ trigger_fired/trigger_status non gestiti dal client │ RISOLTO │ useSwarm.js gestisce entrambi (righe 60-72)                    │
  ├─────────────────────────────────────────────────────┼─────────┼────────────────────────────────────────────────────────────────┤
  │ rss_item non gestito dal client                     │ RISOLTO │ useSwarm.js gestisce rss_item (righe 74-85)                    │
  ├─────────────────────────────────────────────────────┼─────────┼────────────────────────────────────────────────────────────────┤
  │ onUpdateNode non passato a AgentInspector           │ RISOLTO │ SwarmCanvas.jsx riga 97-103 definisce e passa handleUpdateNode │
  └─────────────────────────────────────────────────────┴─────────┴────────────────────────────────────────────────────────────────┘

  ---
  RIEPILOGO

  ┌─────────────────────────────────────────┬───────────────────────────────────────┐
  │                Categoria                │               Conteggio               │
  ├─────────────────────────────────────────┼───────────────────────────────────────┤
  │ Bug Reali                               │ 8                                     │
  ├─────────────────────────────────────────┼───────────────────────────────────────┤
  │ Bug Severita' MEDIA                     │ 3 (BUG-1, BUG-2, BUG-5)               │
  ├─────────────────────────────────────────┼───────────────────────────────────────┤
  │ Bug Severita' BASSA                     │ 5 (BUG-3, BUG-4, BUG-6, BUG-7, BUG-8) │
  ├─────────────────────────────────────────┼───────────────────────────────────────┤
  │ Discrepanze PRD (non-bug)               │ 8                                     │
  ├─────────────────────────────────────────┼───────────────────────────────────────┤
  │ PRD Known Issues risolti                │ 5/5                                   │
  ├─────────────────────────────────────────┼───────────────────────────────────────┤
  │ Funzionalita' completamente funzionanti │ ~85%                                  │
  └─────────────────────────────────────────┴───────────────────────────────────────┘

  I 3 bug piu' importanti da fixare:

  1. BUG-1 — Reject HITL non inietta messaggio e non sblocca l'agente
  2. BUG-2 — BroadcastBar manca scope department/agent
  3. BUG-5 — lastOutputSnippet non in real-time via WS (micro-log non si aggiorna live)