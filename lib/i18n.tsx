"use client";

// Lightweight i18n — no library, works offline (the PWA needs that).
//
// How it works: the English text IS the key. `tr("Save")` returns the
// translation for the active language, or the English text if there isn't
// one. Enum codes from the database (IN_PROGRESS, RED, AT_OFFICE …) go
// through `ev()`. Language is chosen per person: onboarding / the switcher
// (bottom-left) / the worker's saved profile language, and it is remembered
// on the device.
//
// Adding a language = add a column to ROWS + an entry in LANGS.
// Adding a string   = add a row to ROWS and wrap the text with tr().

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "en" | "pt" | "es" | "fr" | "it" | "uk";

export const LANGS: { code: Lang; label: string; locale: string }[] = [
  { code: "pt", label: "Português", locale: "pt-PT" },
  { code: "en", label: "English", locale: "en-GB" },
  { code: "es", label: "Español", locale: "es-ES" },
  { code: "fr", label: "Français", locale: "fr-FR" },
  { code: "it", label: "Italiano", locale: "it-IT" },
  { code: "uk", label: "Українська", locale: "uk-UA" },
];

// Column order: [en, pt, es, fr, it, uk]
type Row = [string, string, string, string, string, string];

const ROWS: Row[] = [
  // ---- common ----
  ["Sign out", "Terminar sessão", "Cerrar sesión", "Se déconnecter", "Esci", "Вийти"],
  ["Back", "Voltar", "Volver", "Retour", "Indietro", "Назад"],
  ["Loading…", "A carregar…", "Cargando…", "Chargement…", "Caricamento…", "Завантаження…"],
  ["Language", "Idioma", "Idioma", "Langue", "Lingua", "Мова"],
  ["DEMO DATA", "DADOS DE DEMO", "DATOS DE DEMO", "DONNÉES DE DÉMO", "DATI DEMO", "ДЕМО-ДАНІ"],
  ["Reset", "Repor", "Restablecer", "Réinitialiser", "Ripristina", "Скинути"],

  // ---- notifications bell / footer / apartment media ----
  ["Notifications", "Notificações", "Notificaciones", "Notifications", "Notifiche", "Сповіщення"],
  ["Notifications are not set up on the server yet.", "As notificações ainda não estão configuradas no servidor.", "Las notificaciones aún no están configuradas en el servidor.", "Les notifications ne sont pas encore configurées sur le serveur.", "Le notifiche non sono ancora configurate sul server.", "Сповіщення на сервері ще не налаштовано."],
  ["No notifications yet", "Ainda sem notificações", "Aún no hay notificaciones", "Aucune notification pour le moment", "Ancora nessuna notifica", "Сповіщень ще немає"],
  ["Mark all as read", "Marcar tudo como lido", "Marcar todo como leído", "Tout marquer comme lu", "Segna tutto come letto", "Позначити все прочитаним"],
  ["Sound on", "Som ligado", "Sonido activado", "Son activé", "Suono attivo", "Звук увімкнено"],
  ["Sound off", "Som desligado", "Sonido desactivado", "Son désactivé", "Suono disattivato", "Звук вимкнено"],
  ["Phone alerts", "Alertas no telemóvel", "Alertas en el móvil", "Alertes sur le téléphone", "Avvisi sul telefono", "Сповіщення на телефоні"],
  ["All rights reserved.", "Todos os direitos reservados.", "Todos los derechos reservados.", "Tous droits réservés.", "Tutti i diritti riservati.", "Усі права захищено."],
  ["Apartment photo", "Foto do apartamento", "Foto del apartamento", "Photo de l'appartement", "Foto dell'appartamento", "Фото квартири"],
  ["Apartment photo / video", "Foto / vídeo do apartamento", "Foto / vídeo del apartamento", "Photo / vidéo de l'appartement", "Foto / video dell'appartamento", "Фото / відео квартири"],
  ["Upload photo", "Carregar foto", "Subir foto", "Importer une photo", "Carica foto", "Завантажити фото"],
  ["Replace photo", "Substituir foto", "Reemplazar foto", "Remplacer la photo", "Sostituisci foto", "Замінити фото"],
  ["Upload video", "Carregar vídeo", "Subir vídeo", "Importer une vidéo", "Carica video", "Завантажити відео"],
  ["Replace video", "Substituir vídeo", "Reemplazar vídeo", "Remplacer la vidéo", "Sostituisci video", "Замінити відео"],
  ["Remove video", "Remover vídeo", "Quitar vídeo", "Retirer la vidéo", "Rimuovi video", "Прибрати відео"],
  ["Video is too large (max 6 MB).", "O vídeo é demasiado grande (máx. 6 MB).", "El vídeo es demasiado grande (máx. 6 MB).", "La vidéo est trop volumineuse (6 Mo max).", "Il video è troppo grande (max 6 MB).", "Відео завелике (макс. 6 МБ)."],
  ["Could not read that video.", "Não foi possível ler esse vídeo.", "No se pudo leer ese vídeo.", "Impossible de lire cette vidéo.", "Impossibile leggere il video.", "Не вдалося прочитати це відео."],

  // ---- login / dev-login ----
  ["Sign in", "Iniciar sessão", "Iniciar sesión", "Se connecter", "Accedi", "Увійти"],
  ["For managers, coordinators and admins. Cleaning and maintenance staff use the mobile onboarding flow instead.",
    "Para gestores, coordenadores e administradores. A equipa de limpeza e manutenção usa o registo no telemóvel.",
    "Para gerentes, coordinadores y administradores. El personal de limpieza y mantenimiento usa el registro desde el móvil.",
    "Pour les responsables, coordinateurs et administrateurs. Le personnel de ménage et de maintenance utilise l'inscription sur mobile.",
    "Per responsabili, coordinatori e amministratori. Il personale di pulizia e manutenzione usa la registrazione da cellulare.",
    "Для менеджерів, координаторів та адміністраторів. Персонал з прибирання та технічного обслуговування користується реєстрацією на телефоні."],
  ["Username", "Utilizador", "Usuario", "Identifiant", "Nome utente", "Ім'я користувача"],
  ["Password", "Palavra-passe", "Contraseña", "Mot de passe", "Password", "Пароль"],
  ["Incorrect username or password.", "Utilizador ou palavra-passe incorretos.", "Usuario o contraseña incorrectos.", "Identifiant ou mot de passe incorrect.", "Nome utente o password errati.", "Неправильне ім'я користувача або пароль."],
  ["Signing in…", "A iniciar sessão…", "Iniciando sesión…", "Connexion…", "Accesso in corso…", "Вхід…"],
  ["Demo — one-tap sign in", "Demo — acesso com um toque", "Demo — acceso con un toque", "Démo — connexion en un clic", "Demo — accesso con un tocco", "Демо — вхід одним дотиком"],
  ["Manager", "Gestor", "Gerente", "Responsable", "Responsabile", "Менеджер"],
  ["Coordinator", "Coordenador", "Coordinador", "Coordinateur", "Coordinatore", "Координатор"],
  ["Super Admin", "Super Administrador", "Superadministrador", "Super administrateur", "Super amministratore", "Суперадміністратор"],
  ["Field staff (cleaners / maintenance):", "Equipa de campo (limpeza / manutenção):", "Personal de campo (limpieza / mantenimiento):", "Personnel de terrain (ménage / maintenance) :", "Personale sul campo (pulizie / manutenzione):", "Польовий персонал (прибирання / обслуговування):"],
  ["Open the mobile demo", "Abrir a demo móvel", "Abrir la demo móvil", "Ouvrir la démo mobile", "Apri la demo mobile", "Відкрити мобільне демо"],
  ["Staff quick login", "Acesso rápido da equipa", "Acceso rápido del personal", "Connexion rapide du personnel", "Accesso rapido del personale", "Швидкий вхід персоналу"],
  ["Tap a name to open the app as that person.", "Toque num nome para abrir a app como essa pessoa.", "Toca un nombre para abrir la app como esa persona.", "Touchez un nom pour ouvrir l'application comme cette personne.", "Tocca un nome per aprire l'app come quella persona.", "Торкніться імені, щоб відкрити застосунок від імені цієї особи."],
  ["Managers, coordinators and admins:", "Gestores, coordenadores e administradores:", "Gerentes, coordinadores y administradores:", "Responsables, coordinateurs et administrateurs :", "Responsabili, coordinatori e amministratori:", "Менеджери, координатори та адміністратори:"],
  ["No workers yet.", "Ainda não há funcionários.", "Aún no hay trabajadores.", "Aucun employé pour l'instant.", "Nessun addetto per ora.", "Поки що немає працівників."],

  // ---- onboarding ----
  ["Welcome", "Bem-vindo", "Bienvenido", "Bienvenue", "Benvenuto", "Ласкаво просимо"],
  ["This only happens once — it creates your worker ID.", "Isto só acontece uma vez — cria o seu ID de trabalhador.", "Esto solo ocurre una vez: crea tu ID de trabajador.", "Cela n'arrive qu'une fois : cela crée votre identifiant d'employé.", "Succede una sola volta: crea il tuo ID di lavoratore.", "Це буває лише раз — створюється ваш ідентифікатор працівника."],
  ["Your name", "O seu nome", "Tu nombre", "Votre nom", "Il tuo nome", "Ваше ім'я"],
  ["e.g. Maria Costa", "ex.: Maria Costa", "p. ej. María Costa", "p. ex. Maria Costa", "es. Maria Costa", "напр. Maria Costa"],
  ["Your area", "A sua área", "Tu área", "Votre domaine", "La tua area", "Ваш напрямок"],
  ["🧹 Cleaning Team", "🧹 Equipa de Limpeza", "🧹 Equipo de Limpieza", "🧹 Équipe de ménage", "🧹 Squadra pulizie", "🧹 Команда прибирання"],
  ["🔧 Maintenance Team", "🔧 Equipa de Manutenção", "🔧 Equipo de Mantenimiento", "🔧 Équipe de maintenance", "🔧 Squadra manutenzione", "🔧 Команда технічного обслуговування"],
  ["Continue", "Continuar", "Continuar", "Continuer", "Continua", "Продовжити"],
  ["Setting up…", "A configurar…", "Configurando…", "Configuration…", "Configurazione…", "Налаштування…"],
  ["Please enter your name and choose an area.", "Introduza o seu nome e escolha uma área.", "Introduce tu nombre y elige un área.", "Veuillez saisir votre nom et choisir un domaine.", "Inserisci il tuo nome e scegli un'area.", "Введіть ім'я та оберіть напрямок."],
  ["Something went wrong. Please try again.", "Algo correu mal. Tente novamente.", "Algo salió mal. Inténtalo de nuevo.", "Une erreur s'est produite. Veuillez réessayer.", "Qualcosa è andato storto. Riprova.", "Щось пішло не так. Спробуйте ще раз."],

  // ---- cleaner app ----
  ["My Houses — Today", "As Minhas Casas — Hoje", "Mis Casas — Hoy", "Mes logements — Aujourd'hui", "Le mie case — Oggi", "Мої будинки — сьогодні"],
  ["{n} assigned", "{n} atribuídas", "{n} asignadas", "{n} assignées", "{n} assegnate", "призначено: {n}"],
  ["Open in Google Maps", "Abrir no Google Maps", "Abrir en Google Maps", "Ouvrir dans Google Maps", "Apri in Google Maps", "Відкрити в Google Maps"],
  ["No tasks assigned yet.", "Ainda não há tarefas atribuídas.", "Aún no hay tareas asignadas.", "Aucune tâche assignée pour l'instant.", "Nessuna attività assegnata.", "Завдань ще не призначено."],
  ["Start cleaning", "Iniciar limpeza", "Iniciar limpieza", "Commencer le ménage", "Inizia la pulizia", "Почати прибирання"],
  ["Note", "Nota", "Nota", "Note", "Nota", "Примітка"],
  ["Add before/after photo", "Adicionar foto antes/depois", "Añadir foto antes/después", "Ajouter une photo avant/après", "Aggiungi foto prima/dopo", "Додати фото до/після"],
  ["Report damage / issue", "Reportar dano / problema", "Reportar daño / problema", "Signaler un dommage / problème", "Segnala danno / problema", "Повідомити про пошкодження / проблему"],
  ["Request products / materials", "Pedir produtos / materiais", "Solicitar productos / materiales", "Demander produits / matériel", "Richiedi prodotti / materiali", "Запросити засоби / матеріали"],
  ["Mark ready for check-in", "Marcar pronto para check-in", "Marcar listo para el check-in", "Marquer prêt pour l'arrivée", "Segna pronto per il check-in", "Позначити готовим до заселення"],
  ["Report an Issue", "Reportar um Problema", "Reportar un Problema", "Signaler un problème", "Segnala un problema", "Повідомити про проблему"],
  ["{house} — goes straight to Maintenance", "{house} — vai direto para a Manutenção", "{house} — va directo a Mantenimiento", "{house} — va directement à la Maintenance", "{house} — va direttamente alla Manutenzione", "{house} — надходить одразу до технічної служби"],
  ["Area", "Área", "Área", "Zone", "Area", "Зона"],
  ["Priority", "Prioridade", "Prioridad", "Priorité", "Priorità", "Пріоритет"],
  ["What's wrong?", "O que se passa?", "¿Qué pasa?", "Quel est le problème ?", "Qual è il problema?", "Що сталося?"],
  ["e.g. Leaking pipe under the sink", "ex.: Cano a pingar debaixo do lava-loiça", "p. ej. Tubería con fuga bajo el fregadero", "p. ex. Fuite de tuyau sous l'évier", "es. Tubo che perde sotto il lavandino", "напр. Тече труба під раковиною"],
  ["Attach photo / video", "Anexar foto / vídeo", "Adjuntar foto / vídeo", "Joindre photo / vidéo", "Allega foto / video", "Додати фото / відео"],
  ["Submit to Maintenance", "Enviar para a Manutenção", "Enviar a Mantenimiento", "Envoyer à la Maintenance", "Invia alla Manutenzione", "Надіслати до технічної служби"],
  ["Submitting…", "A enviar…", "Enviando…", "Envoi…", "Invio…", "Надсилання…"],
  ["Ticket submitted", "Ticket enviado", "Ticket enviado", "Ticket envoyé", "Ticket inviato", "Заявку надіслано"],
  ["Maintenance has been notified.", "A Manutenção foi notificada.", "Mantenimiento ha sido notificado.", "La Maintenance a été prévenue.", "La Manutenzione è stata avvisata.", "Технічну службу повідомлено."],
  ["Back to checklist", "Voltar à lista", "Volver a la lista", "Retour à la liste", "Torna alla lista", "Назад до списку"],
  ["Request sent", "Pedido enviado", "Solicitud enviada", "Demande envoyée", "Richiesta inviata", "Запит надіслано"],
  ["Your manager can see this on the Ops Overview board.", "O seu gestor pode ver isto no painel de Operações.", "Tu responsable puede verlo en el panel de Operaciones.", "Votre responsable peut le voir sur le tableau des opérations.", "Il tuo responsabile può vederlo nel pannello Operazioni.", "Ваш менеджер бачить це на панелі операцій."],
  ["Request Products / Materials", "Pedir Produtos / Materiais", "Solicitar Productos / Materiales", "Demander produits / matériel", "Richiedi prodotti / materiali", "Запит засобів / матеріалів"],
  ["What do you need?", "O que precisa?", "¿Qué necesitas?", "De quoi avez-vous besoin ?", "Di cosa hai bisogno?", "Що вам потрібно?"],
  ["e.g. Bathroom disinfectant x2, bin bags, hand soap", "ex.: Desinfetante de casa de banho x2, sacos do lixo, sabonete líquido", "p. ej. Desinfectante de baño x2, bolsas de basura, jabón de manos", "p. ex. Désinfectant salle de bain x2, sacs-poubelle, savon pour les mains", "es. Disinfettante bagno x2, sacchi della spazzatura, sapone per le mani", "напр. Дезінфектор для ванної x2, пакети для сміття, рідке мило"],
  ["Send Request", "Enviar Pedido", "Enviar Solicitud", "Envoyer la demande", "Invia richiesta", "Надіслати запит"],
  ["Sending…", "A enviar…", "Enviando…", "Envoi…", "Invio…", "Надсилання…"],
  ["No worker ID found — please complete onboarding first.", "ID de trabalhador não encontrado — conclua primeiro o registo.", "No se encontró ID de trabajador: completa primero el registro.", "Aucun identifiant trouvé — terminez d'abord l'inscription.", "ID lavoratore non trovato: completa prima la registrazione.", "Ідентифікатор працівника не знайдено — спершу завершіть реєстрацію."],

  // rooms / areas of a house
  ["Bathroom", "Casa de banho", "Baño", "Salle de bain", "Bagno", "Ванна"],
  ["Kitchen", "Cozinha", "Cocina", "Cuisine", "Cucina", "Кухня"],
  ["Bedroom", "Quarto", "Dormitorio", "Chambre", "Camera da letto", "Спальня"],
  ["Living room", "Sala", "Sala de estar", "Salon", "Soggiorno", "Вітальня"],
  ["Outdoor", "Exterior", "Exterior", "Extérieur", "Esterno", "Двір"],
  ["Other", "Outro", "Otro", "Autre", "Altro", "Інше"],

  // checklist items
  ["Linen & bed sheets changed", "Roupa de cama e lençóis trocados", "Ropa de cama y sábanas cambiadas", "Linge et draps changés", "Biancheria e lenzuola cambiate", "Постільна білизна замінена"],
  ["Bathroom & toilet disinfected", "Casa de banho e sanita desinfetadas", "Baño e inodoro desinfectados", "Salle de bain et toilettes désinfectées", "Bagno e WC disinfettati", "Ванна та туалет продезінфіковані"],
  ["Kitchen & appliances cleaned", "Cozinha e eletrodomésticos limpos", "Cocina y electrodomésticos limpios", "Cuisine et appareils nettoyés", "Cucina ed elettrodomestici puliti", "Кухня та техніка прибрані"],
  ["Floors vacuumed & mopped", "Chão aspirado e lavado", "Suelos aspirados y fregados", "Sols aspirés et lavés", "Pavimenti aspirati e lavati", "Підлогу пропилососено та вимито"],
  ["Windows & mirrors wiped", "Janelas e espelhos limpos", "Ventanas y espejos limpios", "Fenêtres et miroirs essuyés", "Finestre e specchi puliti", "Вікна та дзеркала протерті"],
  ["Trash emptied", "Lixo despejado", "Basura vaciada", "Poubelles vidées", "Spazzatura svuotata", "Сміття винесено"],

  // ---- maintenance app ----
  ["Open Tickets", "Pedidos Abertos", "Tickets Abiertos", "Tickets ouverts", "Ticket aperti", "Відкриті заявки"],
  ["Sorted by priority", "Ordenados por prioridade", "Ordenados por prioridad", "Triés par priorité", "Ordinati per priorità", "Відсортовано за пріоритетом"],
  ["Reported by {name}", "Reportado por {name}", "Reportado por {name}", "Signalé par {name}", "Segnalato da {name}", "Повідомив(ла): {name}"],
  ["Accept", "Aceitar", "Aceptar", "Accepter", "Accetta", "Прийняти"],
  ["Reject", "Rejeitar", "Rechazar", "Refuser", "Rifiuta", "Відхилити"],
  ["Start intervention", "Iniciar intervenção", "Iniciar intervención", "Démarrer l'intervention", "Avvia intervento", "Почати роботу"],
  ["Materials used", "Materiais usados", "Materiales usados", "Matériel utilisé", "Materiali usati", "Використані матеріали"],
  ["e.g. pipe seal, wrench", "ex.: vedante, chave inglesa", "p. ej. sellador, llave inglesa", "p. ex. joint, clé à molette", "es. guarnizione, chiave inglese", "напр. ущільнювач, гайковий ключ"],
  ["Time spent (minutes)", "Tempo gasto (minutos)", "Tiempo empleado (minutos)", "Temps passé (minutes)", "Tempo impiegato (minuti)", "Витрачений час (хвилини)"],
  ["Attach after-work photo", "Anexar foto depois do trabalho", "Adjuntar foto después del trabajo", "Joindre une photo après travaux", "Allega foto a lavoro finito", "Додати фото після роботи"],
  ["Close ticket", "Fechar pedido", "Cerrar ticket", "Clôturer le ticket", "Chiudi ticket", "Закрити заявку"],
  ["No open tickets.", "Sem pedidos abertos.", "No hay tickets abiertos.", "Aucun ticket ouvert.", "Nessun ticket aperto.", "Відкритих заявок немає."],

  // ---- manager ----
  ["Cleaning Tasks — Live", "Tarefas de Limpeza — Em Direto", "Tareas de Limpieza — En Vivo", "Tâches de ménage — En direct", "Attività di pulizia — In diretta", "Завдання прибирання — наживо"],
  ["Signed in as {name}", "Sessão iniciada como {name}", "Sesión iniciada como {name}", "Connecté en tant que {name}", "Accesso come {name}", "Ви увійшли як {name}"],
  ["Check-in Readiness", "Prontidão para Check-in", "Preparación para el Check-in", "Préparation des arrivées", "Prontezza check-in", "Готовність до заселення"],
  ["Ops Overview", "Visão Operacional", "Resumen de Operaciones", "Vue d'ensemble des opérations", "Panoramica operativa", "Огляд операцій"],
  ["Scheduled / assigned", "Agendadas / atribuídas", "Programadas / asignadas", "Planifiées / assignées", "Programmate / assegnate", "Заплановані / призначені"],
  ["House", "Casa", "Casa", "Logement", "Casa", "Будинок"],
  ["Type", "Tipo", "Tipo", "Type", "Tipo", "Тип"],
  ["Time", "Hora", "Hora", "Heure", "Ora", "Час"],
  ["Assigned to", "Atribuído a", "Asignado a", "Assigné à", "Assegnato a", "Виконавець"],
  ["Status", "Estado", "Estado", "Statut", "Stato", "Статус"],
  ["Approve", "Aprovar", "Aprobar", "Approuver", "Approva", "Затвердити"],
  ["No tasks yet.", "Ainda não há tarefas.", "Aún no hay tareas.", "Aucune tâche pour l'instant.", "Nessuna attività per ora.", "Завдань поки немає."],

  // ---- coordinator ----
  ["Verify cleaning, maintenance, linens and keys before confirming a house is ready.", "Verifique limpeza, manutenção, roupa de cama e chaves antes de confirmar que a casa está pronta.", "Verifica limpieza, mantenimiento, ropa de cama y llaves antes de confirmar que la casa está lista.", "Vérifiez le ménage, la maintenance, le linge et les clés avant de confirmer qu'un logement est prêt.", "Verifica pulizia, manutenzione, biancheria e chiavi prima di confermare che la casa è pronta.", "Перевірте прибирання, ремонт, білизну та ключі, перш ніж підтвердити готовність будинку."],
  ["Cleaning: {status}", "Limpeza: {status}", "Limpieza: {status}", "Ménage : {status}", "Pulizia: {status}", "Прибирання: {status}"],
  ["Open maintenance: {n}", "Manutenção em aberto: {n}", "Mantenimiento abierto: {n}", "Maintenance ouverte : {n}", "Manutenzione aperta: {n}", "Відкритих заявок: {n}"],
  ["Confirm ready for check-in", "Confirmar pronto para check-in", "Confirmar listo para el check-in", "Confirmer prêt pour l'arrivée", "Conferma pronto per il check-in", "Підтвердити готовність до заселення"],
  ["✓ Ready", "✓ Pronta", "✓ Lista", "✓ Prêt", "✓ Pronta", "✓ Готово"],
  ["No houses yet.", "Ainda não há casas.", "Aún no hay casas.", "Aucun logement pour l'instant.", "Nessuna casa per ora.", "Будинків поки немає."],

  // ---- ops ----
  ["Operations Overview", "Visão Geral de Operações", "Resumen de Operaciones", "Vue d'ensemble des opérations", "Panoramica delle operazioni", "Огляд операцій"],
  ["Houses with activity", "Casas com atividade", "Casas con actividad", "Logements actifs", "Case con attività", "Будинки з активністю"],
  ["Urgent problems", "Problemas urgentes", "Problemas urgentes", "Problèmes urgents", "Problemi urgenti", "Термінові проблеми"],
  ["Completed today", "Concluídas hoje", "Completadas hoy", "Terminées aujourd'hui", "Completate oggi", "Виконано сьогодні"],
  ["Overdue work", "Trabalho em atraso", "Trabajo atrasado", "Travaux en retard", "Lavori in ritardo", "Прострочені роботи"],
  ["Open tasks", "Tarefas em aberto", "Tareas abiertas", "Tâches ouvertes", "Attività aperte", "Відкриті завдання"],
  ["Pending material requests", "Pedidos de materiais pendentes", "Solicitudes de materiales pendientes", "Demandes de matériel en attente", "Richieste di materiali in sospeso", "Запити на матеріали в очікуванні"],
  ["Keys missing", "Chaves em falta", "Llaves desaparecidas", "Clés manquantes", "Chiavi mancanti", "Відсутні ключі"],
  ["Staff workload (open tasks)", "Carga da equipa (tarefas em aberto)", "Carga del personal (tareas abiertas)", "Charge du personnel (tâches ouvertes)", "Carico del personale (attività aperte)", "Навантаження персоналу (відкриті завдання)"],
  ["None right now.", "Nenhum de momento.", "Ninguno por ahora.", "Aucun pour le moment.", "Nessuno al momento.", "Наразі немає."],
  ["No assignments yet.", "Ainda sem atribuições.", "Aún sin asignaciones.", "Aucune affectation pour l'instant.", "Nessuna assegnazione per ora.", "Призначень поки немає."],
  ["Nothing pending.", "Nada pendente.", "Nada pendiente.", "Rien en attente.", "Niente in sospeso.", "Нічого в очікуванні."],
  ["Mark fulfilled", "Marcar como entregue", "Marcar como atendida", "Marquer comme traitée", "Segna come evasa", "Позначити виконаним"],
  ["Key status", "Estado das chaves", "Estado de las llaves", "État des clés", "Stato delle chiavi", "Стан ключів"],
  ["{items} — requested by {name}", "{items} — pedido por {name}", "{items} — solicitado por {name}", "{items} — demandé par {name}", "{items} — richiesto da {name}", "{items} — запитав(ла) {name}"],

  // ---- admin ----
  ["Staff & Roles", "Equipa e Funções", "Personal y Roles", "Personnel et rôles", "Personale e ruoli", "Персонал і ролі"],
  ["Change anyone's role anytime. Promoting someone to Manager, Coordinator or Super Admin will ask you to set their login username/password.",
    "Altere a função de qualquer pessoa a qualquer momento. Promover alguém a Gestor, Coordenador ou Super Administrador pede-lhe que defina o utilizador e a palavra-passe de acesso.",
    "Cambia el rol de cualquiera en cualquier momento. Al ascender a alguien a Gerente, Coordinador o Superadministrador se te pedirá definir su usuario y contraseña.",
    "Changez le rôle de n'importe qui à tout moment. Promouvoir quelqu'un Responsable, Coordinateur ou Super administrateur vous demandera de définir son identifiant et son mot de passe.",
    "Cambia il ruolo di chiunque in qualsiasi momento. Promuovere qualcuno a Responsabile, Coordinatore o Super amministratore richiederà di impostare nome utente e password.",
    "Змінюйте роль будь-кого в будь-який час. Під час підвищення до менеджера, координатора чи суперадміністратора потрібно буде задати ім'я користувача та пароль."],
  ["Name", "Nome", "Nombre", "Nom", "Nome", "Ім'я"],
  ["Team", "Equipa", "Equipo", "Équipe", "Squadra", "Команда"],
  ["Joined", "Entrada", "Alta", "Inscription", "Iscritto", "Приєднався"],
  ["Role", "Função", "Rol", "Rôle", "Ruolo", "Роль"],
  ["Login", "Acesso", "Acceso", "Connexion", "Accesso", "Вхід"],
  ["Set up login", "Definir acesso", "Configurar acceso", "Configurer l'accès", "Imposta accesso", "Налаштувати вхід"],
  ["device ID", "ID do dispositivo", "ID del dispositivo", "ID de l'appareil", "ID del dispositivo", "ID пристрою"],
  ["No staff onboarded yet.", "Ainda não há funcionários registados.", "Aún no hay personal registrado.", "Aucun employé inscrit pour l'instant.", "Nessun addetto registrato.", "Працівників ще не зареєстровано."],
  ["Set login for {name}", "Definir acesso para {name}", "Configurar acceso para {name}", "Configurer l'accès de {name}", "Imposta accesso per {name}", "Налаштувати вхід для {name}"],
  ["Password (min 8 characters)", "Palavra-passe (mín. 8 caracteres)", "Contraseña (mín. 8 caracteres)", "Mot de passe (8 caractères min.)", "Password (min. 8 caratteri)", "Пароль (мін. 8 символів)"],
  ["Cancel", "Cancelar", "Cancelar", "Annuler", "Annulla", "Скасувати"],
  ["Save", "Guardar", "Guardar", "Enregistrer", "Salva", "Зберегти"],
  ["Could not save credentials.", "Não foi possível guardar as credenciais.", "No se pudieron guardar las credenciales.", "Impossible d'enregistrer les identifiants.", "Impossibile salvare le credenziali.", "Не вдалося зберегти облікові дані."],

  // ---- editing / create forms ----
  ["Edit", "Editar", "Editar", "Modifier", "Modifica", "Редагувати"],
  ["Delete", "Eliminar", "Eliminar", "Supprimer", "Elimina", "Видалити"],
  ["Add", "Adicionar", "Añadir", "Ajouter", "Aggiungi", "Додати"],
  ["Remove", "Remover", "Quitar", "Retirer", "Rimuovi", "Прибрати"],
  ["Saving…", "A guardar…", "Guardando…", "Enregistrement…", "Salvataggio…", "Збереження…"],
  ["Could not save. Please try again.", "Não foi possível guardar. Tente novamente.", "No se pudo guardar. Inténtalo de nuevo.", "Enregistrement impossible. Veuillez réessayer.", "Impossibile salvare. Riprova.", "Не вдалося зберегти. Спробуйте ще раз."],
  ["Delete this item? This cannot be undone.", "Eliminar este item? Não pode ser desfeito.", "¿Eliminar este elemento? No se puede deshacer.", "Supprimer cet élément ? Action irréversible.", "Eliminare questo elemento? Non si può annullare.", "Видалити цей елемент? Це не можна скасувати."],
  ["Delete this task? This cannot be undone.", "Eliminar esta tarefa? Não pode ser desfeito.", "¿Eliminar esta tarea? No se puede deshacer.", "Supprimer cette tâche ? Action irréversible.", "Eliminare questa attività? Non si può annullare.", "Видалити це завдання? Це не можна скасувати."],
  ["Delete this ticket? This cannot be undone.", "Eliminar este pedido? Não pode ser desfeito.", "¿Eliminar este ticket? No se puede deshacer.", "Supprimer ce ticket ? Action irréversible.", "Eliminare questo ticket? Non si può annullare.", "Видалити цю заявку? Це не можна скасувати."],
  ["Delete this request? This cannot be undone.", "Eliminar este pedido? Não pode ser desfeito.", "¿Eliminar esta solicitud? No se puede deshacer.", "Supprimer cette demande ? Action irréversible.", "Eliminare questa richiesta? Non si può annullare.", "Видалити цей запит? Це не можна скасувати."],
  ["Delete this house and all its tasks, tickets and requests? This cannot be undone.", "Eliminar esta casa e todas as suas tarefas, pedidos e requisições? Não pode ser desfeito.", "¿Eliminar esta casa y todas sus tareas, tickets y solicitudes? No se puede deshacer.", "Supprimer ce logement et toutes ses tâches, tickets et demandes ? Action irréversible.", "Eliminare questa casa e tutte le sue attività, ticket e richieste? Non si può annullare.", "Видалити цей будинок разом з усіма його завданнями, заявками та запитами? Це не можна скасувати."],
  ["Remove this person? Their jobs will become unassigned.", "Remover esta pessoa? As tarefas dela ficarão sem atribuição.", "¿Quitar a esta persona? Sus tareas quedarán sin asignar.", "Retirer cette personne ? Ses tâches ne seront plus assignées.", "Rimuovere questa persona? Le sue attività resteranno non assegnate.", "Прибрати цю особу? Її завдання стануть непризначеними."],
  ["This person has reports on record, so they can't be deleted.", "Esta pessoa tem registos associados, por isso não pode ser eliminada.", "Esta persona tiene registros asociados, por lo que no se puede eliminar.", "Cette personne a des signalements enregistrés, elle ne peut pas être supprimée.", "Questa persona ha segnalazioni registrate, quindi non può essere eliminata.", "За цією особою є записи, тому її не можна видалити."],
  ["New task", "Nova tarefa", "Nueva tarea", "Nouvelle tâche", "Nuova attività", "Нове завдання"],
  ["Task", "Tarefa", "Tarea", "Tâche", "Attività", "Завдання"],
  ["Issue", "Problema", "Problema", "Problème", "Problema", "Проблема"],
  ["Materials", "Materiais", "Materiales", "Matériel", "Materiali", "Матеріали"],
  ["New request", "Novo pedido", "Nueva solicitud", "Nouvelle demande", "Nuova richiesta", "Новий запит"],
  ["New house", "Nova casa", "Nueva casa", "Nouveau logement", "Nuova casa", "Новий будинок"],
  ["Edit house", "Editar casa", "Editar casa", "Modifier le logement", "Modifica casa", "Редагувати будинок"],
  ["Edit ticket", "Editar pedido", "Editar ticket", "Modifier le ticket", "Modifica ticket", "Редагувати заявку"],
  ["Edit cleaning task", "Editar tarefa de limpeza", "Editar tarea de limpieza", "Modifier la tâche de ménage", "Modifica attività di pulizia", "Редагувати завдання прибирання"],
  ["New cleaning task", "Nova tarefa de limpeza", "Nueva tarea de limpieza", "Nouvelle tâche de ménage", "Nuova attività di pulizia", "Нове завдання прибирання"],
  ["Edit material request", "Editar pedido de materiais", "Editar solicitud de materiales", "Modifier la demande de matériel", "Modifica richiesta materiali", "Редагувати запит матеріалів"],
  ["New material request", "Novo pedido de materiais", "Nueva solicitud de materiales", "Nouvelle demande de matériel", "Nuova richiesta materiali", "Новий запит матеріалів"],
  ["Edit staff", "Editar funcionário", "Editar personal", "Modifier le membre", "Modifica addetto", "Редагувати працівника"],
  ["Add staff", "Adicionar funcionário", "Añadir personal", "Ajouter un membre", "Aggiungi addetto", "Додати працівника"],
  ["Date", "Data", "Fecha", "Date", "Data", "Дата"],
  ["Cleaning type", "Tipo de limpeza", "Tipo de limpieza", "Type de ménage", "Tipo di pulizia", "Тип прибирання"],
  ["Assign to", "Atribuir a", "Asignar a", "Assigner à", "Assegna a", "Призначити"],
  ["Unassigned", "Sem atribuição", "Sin asignar", "Non assigné", "Non assegnata", "Не призначено"],
  ["Estimated minutes", "Minutos estimados", "Minutos estimados", "Minutes estimées", "Minuti stimati", "Орієнтовно хвилин"],
  ["Notes", "Notas", "Notas", "Notes", "Note", "Нотатки"],
  ["Checklist", "Lista de verificação", "Lista de verificación", "Liste de contrôle", "Lista di controllo", "Контрольний список"],
  ["New checklist item", "Novo item da lista", "Nuevo elemento de la lista", "Nouvel élément de la liste", "Nuovo elemento della lista", "Новий пункт списку"],
  ["Address", "Morada", "Dirección", "Adresse", "Indirizzo", "Адреса"],
  ["Temporary listing (Airbnb / Booking)", "Anúncio temporário (Airbnb / Booking)", "Anuncio temporal (Airbnb / Booking)", "Annonce temporaire (Airbnb / Booking)", "Annuncio temporaneo (Airbnb / Booking)", "Тимчасове оголошення (Airbnb / Booking)"],
  ["Temporary", "Temporária", "Temporal", "Temporaire", "Temporanea", "Тимчасово"],
  ["Valid from", "Válido desde", "Válido desde", "Valable à partir du", "Valido dal", "Дійсне з"],
  ["Valid until", "Válido até", "Válido hasta", "Valable jusqu'au", "Valido fino al", "Дійсне до"],
  ["Houses", "Casas", "Casas", "Logements", "Case", "Будинки"],
  ["Pending", "Pendente", "Pendiente", "En attente", "In sospeso", "В очікуванні"],
  ["Fulfilled", "Entregue", "Atendida", "Traitée", "Evasa", "Виконано"],
  ["Reopen", "Reabrir", "Reabrir", "Rouvrir", "Riapri", "Відновити"],
  ["Send back", "Devolver", "Devolver", "Renvoyer", "Rimanda indietro", "Повернути"],
  ["No tasks for this house.", "Sem tarefas para esta casa.", "Sin tareas para esta casa.", "Aucune tâche pour ce logement.", "Nessuna attività per questa casa.", "Для цього будинку завдань немає."],
  ["Open maintenance tickets", "Pedidos de manutenção abertos", "Tickets de mantenimiento abiertos", "Tickets de maintenance ouverts", "Ticket di manutenzione aperti", "Відкриті заявки на обслуговування"],
  ["Undo ready — keep cleaning", "Anular — continuar a limpar", "Deshacer — seguir limpiando", "Annuler — continuer le ménage", "Annulla — continua a pulire", "Скасувати — продовжити прибирання"],

  ["Sort by", "Ordenar por", "Ordenar por", "Trier par", "Ordina per", "Сортувати за"],
  ["Newest", "Mais recentes", "Más recientes", "Plus récents", "Più recenti", "Найновіші"],
  ["Oldest", "Mais antigos", "Más antiguos", "Plus anciens", "Meno recenti", "Найстаріші"],
  ["Switch demo user", "Mudar de utilizador demo", "Cambiar de usuario demo", "Changer d'utilisateur démo", "Cambia utente demo", "Змінити демо-користувача"],
  ["Needs attention", "Requer atenção", "Requiere atención", "À traiter en priorité", "Richiede attenzione", "Потребує уваги"],
  ["What each role can do", "O que cada função pode fazer", "Qué puede hacer cada rol", "Ce que chaque rôle peut faire", "Cosa può fare ogni ruolo", "Що може робити кожна роль"],
  ["Capability", "Permissão", "Permiso", "Droit", "Autorizzazione", "Дозвіл"],
  ["Staff", "Equipa", "Personal", "Personnel", "Personale", "Персонал"],
  ["Menu", "Menu", "Menú", "Menu", "Menu", "Меню"],
  ["Overview", "Resumo", "Resumen", "Aperçu", "Panoramica", "Огляд"],
  ["Tasks", "Tarefas", "Tareas", "Tâches", "Attività", "Завдання"],
  ["Tickets", "Pedidos", "Tickets", "Tickets", "Ticket", "Заявки"],
  ["Keys", "Chaves", "Llaves", "Clés", "Chiavi", "Ключі"],
  ["Workload", "Carga de trabalho", "Carga de trabajo", "Charge de travail", "Carico di lavoro", "Навантаження"],
  ["Staff members", "Funcionários", "Personal", "Membres du personnel", "Addetti", "Працівники"],
  ["Logins set up", "Acessos criados", "Accesos creados", "Accès créés", "Accessi creati", "Облікові записи"],
  ["Temporary houses", "Casas temporárias", "Casas temporales", "Logements temporaires", "Case temporanee", "Тимчасові будинки"],
  ["Houses ready", "Casas prontas", "Casas listas", "Logements prêts", "Case pronte", "Готові будинки"],
  ["Open issues", "Problemas abertos", "Problemas abiertos", "Problèmes ouverts", "Problemi aperti", "Відкриті проблеми"],
  ["Show / hide", "Mostrar / ocultar", "Mostrar / ocultar", "Afficher / masquer", "Mostra / nascondi", "Показати / сховати"],
  ["Show all", "Mostrar tudo", "Mostrar todo", "Tout afficher", "Mostra tutto", "Показати все"],
  ["Hide all", "Ocultar tudo", "Ocultar todo", "Tout masquer", "Nascondi tutto", "Сховати все"],
  ["Role permissions", "Permissões por função", "Permisos por rol", "Droits par rôle", "Permessi per ruolo", "Права за ролями"],
  ["Everything is hidden. Use the buttons above to show a section.", "Tudo está oculto. Use os botões acima para mostrar uma secção.", "Todo está oculto. Usa los botones de arriba para mostrar una sección.", "Tout est masqué. Utilisez les boutons ci-dessus pour afficher une section.", "Tutto è nascosto. Usa i pulsanti qui sopra per mostrare una sezione.", "Усе сховано. Скористайтеся кнопками вище, щоб показати розділ."],
  ["Open app", "Abrir app", "Abrir app", "Ouvrir l'app", "Apri app", "Відкрити застосунок"],
  ["Change password", "Alterar palavra-passe", "Cambiar contraseña", "Changer le mot de passe", "Cambia password", "Змінити пароль"],
  ["You don't have permission to do this.", "Não tem permissão para fazer isto.", "No tienes permiso para hacer esto.", "Vous n'avez pas l'autorisation de faire cela.", "Non hai il permesso per farlo.", "У вас немає дозволу на цю дію."],
  ["You can't change your own role.", "Não pode alterar a sua própria função.", "No puedes cambiar tu propio rol.", "Vous ne pouvez pas modifier votre propre rôle.", "Non puoi modificare il tuo ruolo.", "Ви не можете змінити власну роль."],
  ["Do jobs on the phone (cleaning / maintenance)", "Fazer tarefas no telemóvel (limpeza / manutenção)", "Hacer trabajos desde el móvil (limpieza / mantenimiento)", "Effectuer les missions sur mobile (ménage / maintenance)", "Svolgere i lavori dal cellulare (pulizie / manutenzione)", "Виконувати завдання на телефоні (прибирання / обслуговування)"],
  ["Report an issue / request materials", "Reportar problema / pedir materiais", "Reportar un problema / pedir materiales", "Signaler un problème / demander du matériel", "Segnalare un problema / richiedere materiali", "Повідомити про проблему / запросити матеріали"],
  ["Open the Coordinator screen", "Abrir o ecrã do Coordenador", "Abrir la pantalla de Coordinador", "Ouvrir l'écran Coordinateur", "Aprire la schermata Coordinatore", "Відкривати екран координатора"],
  ["Create & edit cleaning tasks", "Criar e editar tarefas de limpeza", "Crear y editar tareas de limpieza", "Créer et modifier les tâches de ménage", "Creare e modificare attività di pulizia", "Створювати та редагувати завдання прибирання"],
  ["Approve / send back finished jobs", "Aprovar / devolver tarefas concluídas", "Aprobar / devolver trabajos terminados", "Approuver / renvoyer les missions terminées", "Approvare / rimandare i lavori finiti", "Затверджувати / повертати виконані завдання"],
  ["Edit tickets & material requests", "Editar pedidos de manutenção e de materiais", "Editar tickets y solicitudes de materiales", "Modifier tickets et demandes de matériel", "Modificare ticket e richieste di materiali", "Редагувати заявки та запити матеріалів"],
  ["Change key status", "Alterar estado das chaves", "Cambiar estado de las llaves", "Modifier l'état des clés", "Cambiare lo stato delle chiavi", "Змінювати стан ключів"],
  ["Open the Manager & Ops screens", "Abrir os ecrãs de Gestor e Operações", "Abrir las pantallas de Gerente y Operaciones", "Ouvrir les écrans Responsable et Opérations", "Aprire le schermate Responsabile e Operazioni", "Відкривати екрани менеджера та операцій"],
  ["Delete tasks, tickets & requests", "Eliminar tarefas, pedidos e requisições", "Eliminar tareas, tickets y solicitudes", "Supprimer tâches, tickets et demandes", "Eliminare attività, ticket e richieste", "Видаляти завдання, заявки та запити"],
  ["Edit house details", "Editar dados das casas", "Editar datos de las casas", "Modifier les détails des logements", "Modificare i dettagli delle case", "Редагувати дані будинків"],
  ["Add / delete houses", "Adicionar / eliminar casas", "Añadir / eliminar casas", "Ajouter / supprimer des logements", "Aggiungere / eliminare case", "Додавати / видаляти будинки"],
  ["Staff, roles, logins & passwords (Admin screen)", "Equipa, funções, acessos e palavras-passe (ecrã Admin)", "Personal, roles, accesos y contraseñas (pantalla Admin)", "Personnel, rôles, accès et mots de passe (écran Admin)", "Personale, ruoli, accessi e password (schermata Admin)", "Персонал, ролі, входи та паролі (екран адміністратора)"],
  ["Photos", "Fotos", "Fotos", "Photos", "Foto", "Фото"],
  ["Attach photo", "Anexar foto", "Adjuntar foto", "Joindre une photo", "Allega foto", "Додати фото"],
  ["Could not read that photo.", "Não foi possível ler essa foto.", "No se pudo leer esa foto.", "Impossible de lire cette photo.", "Impossibile leggere la foto.", "Не вдалося прочитати це фото."],
  ["Remove photo", "Remover foto", "Quitar foto", "Retirer la photo", "Rimuovi foto", "Прибрати фото"],
  ["After-work photo", "Foto depois do trabalho", "Foto después del trabajo", "Photo après travaux", "Foto a lavoro finito", "Фото після роботи"],
  ["Photo of the issue", "Foto do problema", "Foto del problema", "Photo du problème", "Foto del problema", "Фото проблеми"],
  // ---- audit trail & readiness ----
  ["Change history", "Histórico de alterações", "Historial de cambios", "Historique des modifications", "Cronologia delle modifiche", "Історія змін"],
  ["Who changed what, and when.", "Quem alterou o quê, e quando.", "Quién cambió qué y cuándo.", "Qui a modifié quoi, et quand.", "Chi ha cambiato cosa e quando.", "Хто що змінив і коли."],
  ["When", "Quando", "Cuándo", "Quand", "Quando", "Коли"],
  ["Who", "Quem", "Quién", "Qui", "Chi", "Хто"],
  ["What", "O quê", "Qué", "Quoi", "Cosa", "Що"],
  ["No changes recorded yet.", "Ainda não há alterações registadas.", "Aún no hay cambios registrados.", "Aucune modification enregistrée.", "Nessuna modifica registrata.", "Змін ще не записано."],
  ["Refresh", "Atualizar", "Actualizar", "Actualiser", "Aggiorna", "Оновити"],
  ["See the change history (who changed what)", "Ver o histórico de alterações (quem alterou o quê)", "Ver el historial de cambios (quién cambió qué)", "Voir l'historique des modifications (qui a modifié quoi)", "Vedere la cronologia delle modifiche (chi ha cambiato cosa)", "Переглядати історію змін (хто що змінив)"],
  ["Auto-check: all clear", "Verificação automática: tudo em ordem", "Comprobación automática: todo en orden", "Contrôle auto : tout est bon", "Controllo automatico: tutto a posto", "Автоперевірка: усе гаразд"],
  ["Auto-check: needs attention", "Verificação automática: requer atenção", "Comprobación automática: requiere atención", "Contrôle auto : à vérifier", "Controllo automatico: da verificare", "Автоперевірка: потрібна увага"],
  ["Checklist not fully ticked", "Lista de verificação incompleta", "Lista de verificación incompleta", "Liste de contrôle incomplète", "Checklist non completata", "Чекліст не повністю виконано"],
  ["No photo added", "Sem fotos", "Sin fotos", "Aucune photo", "Nessuna foto", "Немає фото"],
  ["Open maintenance problem", "Problema de manutenção em aberto", "Problema de mantenimiento abierto", "Problème de maintenance ouvert", "Problema di manutenzione aperto", "Відкрита проблема з обслуговування"],
  ["Key is missing", "Chave em falta", "Falta la llave", "Clé manquante", "Chiave mancante", "Ключ відсутній"],
  ["Review before approving", "Rever antes de aprovar", "Revisar antes de aprobar", "Vérifier avant d'approuver", "Controlla prima di approvare", "Перегляд перед затвердженням"],
  ["Task photos", "Fotos da tarefa", "Fotos de la tarea", "Photos de la tâche", "Foto del lavoro", "Фото завдання"],
  ["Apartment reference", "Referência do apartamento", "Referencia del apartamento", "Référence de l'appartement", "Riferimento dell'appartamento", "Еталон квартири"],
  ["Confirm approve", "Confirmar aprovação", "Confirmar aprobación", "Confirmer l'approbation", "Conferma approvazione", "Підтвердити затвердження"],
  ["No checklist items.", "Sem itens na lista.", "Sin elementos en la lista.", "Aucun élément dans la liste.", "Nessun elemento nella lista.", "У списку немає пунктів."],
  // ---- change history, field labels, notifications ----
  ["Started cleaning", "Limpeza iniciada", "Limpieza iniciada", "Nettoyage commencé", "Pulizia iniziata", "Прибирання розпочато"],
  ["Marked ready for check-in", "Marcado como pronto para check-in", "Marcado como listo para el check-in", "Marqué prêt pour l'arrivée", "Segnato come pronto per il check-in", "Позначено як готове до заселення"],
  ["Took back ready for check-in", "Retirou o «pronto para check-in»", "Retiró el «listo para el check-in»", "A retiré le « prêt pour l'arrivée »", "Ha ritirato il «pronto per il check-in»", "Скасовано «готово до заселення»"],
  ["Confirmed ready for check-in", "Confirmado pronto para check-in", "Confirmado listo para el check-in", "Confirmé prêt pour l'arrivée", "Confermato pronto per il check-in", "Підтверджено готовність до заселення"],
  ["Sent back to the cleaner", "Devolvido ao responsável pela limpeza", "Devuelto a la persona de limpieza", "Renvoyé à la personne en charge du ménage", "Rimandato all'addetto alle pulizie", "Повернено прибиральнику"],
  ["Flagged with issue", "Marcado com problema", "Marcado con incidencia", "Signalé avec problème", "Segnalato con problema", "Позначено з проблемою"],
  ["Edited task ({fields})", "Tarefa editada ({fields})", "Tarea editada ({fields})", "Tâche modifiée ({fields})", "Attività modificata ({fields})", "Завдання змінено ({fields})"],
  ["Edited task ({fields}) · status {from} → {to}", "Tarefa editada ({fields}) · estado {from} → {to}", "Tarea editada ({fields}) · estado {from} → {to}", "Tâche modifiée ({fields}) · statut {from} → {to}", "Attività modificata ({fields}) · stato {from} → {to}", "Завдання змінено ({fields}) · статус {from} → {to}"],
  ["Deleted task", "Tarefa eliminada", "Tarea eliminada", "Tâche supprimée", "Attività eliminata", "Завдання видалено"],
  ["Created task for {house} at {time}", "Tarefa criada para {house} às {time}", "Tarea creada para {house} a las {time}", "Tâche créée pour {house} à {time}", "Attività creata per {house} alle {time}", "Створено завдання для {house} на {time}"],
  ["Accepted ticket", "Pedido aceite", "Solicitud aceptada", "Ticket accepté", "Ticket accettato", "Заявку прийнято"],
  ["Rejected ticket", "Pedido rejeitado", "Solicitud rechazada", "Ticket refusé", "Ticket rifiutato", "Заявку відхилено"],
  ["Started intervention", "Intervenção iniciada", "Intervención iniciada", "Intervention commencée", "Intervento iniziato", "Роботу розпочато"],
  ["Closed ticket", "Pedido fechado", "Solicitud cerrada", "Ticket clôturé", "Ticket chiuso", "Заявку закрито"],
  ["Reopened ticket", "Pedido reaberto", "Solicitud reabierta", "Ticket rouvert", "Ticket riaperto", "Заявку відкрито знову"],
  ["Edited ticket ({fields})", "Pedido editado ({fields})", "Solicitud editada ({fields})", "Ticket modifié ({fields})", "Ticket modificato ({fields})", "Заявку змінено ({fields})"],
  ["Edited ticket ({fields}) · status {from} → {to}", "Pedido editado ({fields}) · estado {from} → {to}", "Solicitud editada ({fields}) · estado {from} → {to}", "Ticket modifié ({fields}) · statut {from} → {to}", "Ticket modificato ({fields}) · stato {from} → {to}", "Заявку змінено ({fields}) · статус {from} → {to}"],
  ["Deleted ticket", "Pedido eliminado", "Solicitud eliminada", "Ticket supprimé", "Ticket eliminato", "Заявку видалено"],
  ["Reported issue at {house}: {room}", "Problema reportado em {house}: {room}", "Incidencia comunicada en {house}: {room}", "Problème signalé à {house} : {room}", "Problema segnalato a {house}: {room}", "Повідомлено про проблему в {house}: {room}"],
  ["Requested materials for {house}", "Materiais pedidos para {house}", "Materiales solicitados para {house}", "Matériel demandé pour {house}", "Materiali richiesti per {house}", "Запит матеріалів для {house}"],
  ["Marked request as sorted", "Pedido de materiais marcado como tratado", "Solicitud de materiales marcada como resuelta", "Demande de matériel marquée comme traitée", "Richiesta di materiali segnata come evasa", "Запит матеріалів позначено виконаним"],
  ["Reopened request", "Pedido de materiais reaberto", "Solicitud de materiales reabierta", "Demande de matériel rouverte", "Richiesta di materiali riaperta", "Запит матеріалів відкрито знову"],
  ["Edited request", "Pedido de materiais editado", "Solicitud de materiales editada", "Demande de matériel modifiée", "Richiesta di materiali modificata", "Запит матеріалів змінено"],
  ["Deleted request", "Pedido de materiais eliminado", "Solicitud de materiales eliminada", "Demande de matériel supprimée", "Richiesta di materiali eliminata", "Запит матеріалів видалено"],
  ["Added house {name}", "Casa {name} adicionada", "Casa {name} añadida", "Maison {name} ajoutée", "Casa {name} aggiunta", "Додано будинок {name}"],
  ["Key status of {name} → {state}", "Estado da chave de {name} → {state}", "Estado de la llave de {name} → {state}", "Statut de la clé de {name} → {state}", "Stato della chiave di {name} → {state}", "Статус ключа {name} → {state}"],
  ["Edited house {name} ({fields})", "Casa {name} editada ({fields})", "Casa {name} editada ({fields})", "Maison {name} modifiée ({fields})", "Casa {name} modificata ({fields})", "Будинок {name} змінено ({fields})"],
  ["Deleted house {name} and its tasks, tickets and requests", "Casa {name} eliminada, com as suas tarefas, pedidos e requisições", "Casa {name} eliminada, con sus tareas, solicitudes y pedidos", "Maison {name} supprimée, avec ses tâches, tickets et demandes", "Casa {name} eliminata, con attività, ticket e richieste", "Будинок {name} видалено разом із завданнями, заявками та запитами"],
  ["New staff member onboarded: {name} ({team})", "Novo membro da equipa registado: {name} ({team})", "Nuevo miembro del personal registrado: {name} ({team})", "Nouveau membre du personnel enregistré : {name} ({team})", "Nuovo membro dello staff registrato: {name} ({team})", "Зареєстровано нового працівника: {name} ({team})"],
  ["{name}: role {from} → {to}; changed {fields}", "{name}: função {from} → {to}; alterado {fields}", "{name}: rol {from} → {to}; cambiado {fields}", "{name} : rôle {from} → {to} ; modifié {fields}", "{name}: ruolo {from} → {to}; modificato {fields}", "{name}: роль {from} → {to}; змінено {fields}"],
  ["{name}: changed {fields}", "{name}: alterado {fields}", "{name}: cambiado {fields}", "{name} : modifié {fields}", "{name}: modificato {fields}", "{name}: змінено {fields}"],
  ["Removed staff member {name}", "Membro da equipa {name} removido", "Miembro del personal {name} eliminado", "Membre du personnel {name} supprimé", "Membro dello staff {name} rimosso", "Видалено працівника {name}"],
  ["Removed {count} closed ticket(s) older than {months} months", "Removidos {count} pedido(s) fechado(s) com mais de {months} meses", "Eliminadas {count} solicitud(es) cerrada(s) de más de {months} meses", "{count} ticket(s) clôturé(s) de plus de {months} mois supprimé(s)", "Rimossi {count} ticket chiusi da più di {months} mesi", "Видалено закритих заявок: {count} (старших за {months} міс.)"],
  ["System", "Sistema", "Sistema", "Système", "Sistema", "Система"],
  ["Cleaning types", "Tipos de limpeza", "Tipos de limpieza", "Types de nettoyage", "Tipi di pulizia", "Типи прибирання"],
  ["Materials needed", "Materiais necessários", "Materiales necesarios", "Matériel nécessaire", "Materiali necessari", "Потрібні матеріали"],
  ["Description", "Descrição", "Descripción", "Description", "Descrizione", "Опис"],
  ["Time spent", "Tempo gasto", "Tiempo empleado", "Temps passé", "Tempo impiegato", "Витрачений час"],
  ["Items", "Artigos", "Artículos", "Articles", "Articoli", "Позиції"],
  ["Enable notifications", "Ativar notificações", "Activar notificaciones", "Activer les notifications", "Attiva le notifiche", "Увімкнути сповіщення"],
  ["Notifications on", "Notificações ativas", "Notificaciones activadas", "Notifications activées", "Notifiche attive", "Сповіщення увімкнено"],
  ["Turn off", "Desativar", "Desactivar", "Désactiver", "Disattiva", "Вимкнути"],
  ["Send a test", "Enviar teste", "Enviar prueba", "Envoyer un test", "Invia un test", "Надіслати тест"],
  ["Notifications are blocked in your browser settings.", "As notificações estão bloqueadas nas definições do navegador.", "Las notificaciones están bloqueadas en los ajustes del navegador.", "Les notifications sont bloquées dans les réglages du navigateur.", "Le notifiche sono bloccate nelle impostazioni del browser.", "Сповіщення заблоковано в налаштуваннях браузера."],
  ["Notifications are not supported here. On iPhone, add the app to your Home Screen first.", "As notificações não são suportadas aqui. No iPhone, adicione primeiro a app ao Ecrã principal.", "Las notificaciones no son compatibles aquí. En iPhone, añade primero la app a la pantalla de inicio.", "Les notifications ne sont pas prises en charge ici. Sur iPhone, ajoutez d'abord l'app à l'écran d'accueil.", "Le notifiche non sono supportate qui. Su iPhone, aggiungi prima l'app alla schermata Home.", "Сповіщення тут не підтримуються. На iPhone спершу додайте застосунок на головний екран."],
  ["Could not turn on notifications.", "Não foi possível ativar as notificações.", "No se pudieron activar las notificaciones.", "Impossible d'activer les notifications.", "Impossibile attivare le notifiche.", "Не вдалося увімкнути сповіщення."],
  ["Test sent.", "Teste enviado.", "Prueba enviada.", "Test envoyé.", "Test inviato.", "Тест надіслано."],
  // ---- enum labels (status, priority, types, keys, roles) ----
  ["Scheduled", "Agendada", "Programada", "Planifiée", "Programmata", "Заплановано"],
  ["Assigned", "Atribuída", "Asignada", "Assignée", "Assegnata", "Призначено"],
  ["In progress", "Em curso", "En curso", "En cours", "In corso", "В процесі"],
  ["On hold", "Em espera", "En espera", "En attente", "In pausa", "На паузі"],
  ["Completed", "Concluída", "Completada", "Terminée", "Completata", "Завершено"],
  ["To be verified", "Por verificar", "Por verificar", "À vérifier", "Da verificare", "Потребує перевірки"],
  ["Approved", "Aprovada", "Aprobada", "Approuvée", "Approvata", "Затверджено"],
  ["With issue", "Com problema", "Con problema", "Avec problème", "Con problema", "З проблемою"],
  ["Open", "Aberto", "Abierto", "Ouvert", "Aperto", "Відкрито"],
  ["Accepted", "Aceite", "Aceptado", "Accepté", "Accettato", "Прийнято"],
  ["Rejected", "Rejeitado", "Rechazado", "Rejeté", "Rifiutato", "Відхилено"],
  ["Closed", "Fechado", "Cerrado", "Fermé", "Chiuso", "Закрито"],
  ["Yellow", "Amarelo", "Amarillo", "Jaune", "Giallo", "Жовтий"],
  ["Orange", "Laranja", "Naranja", "Orange", "Arancione", "Помаранчевий"],
  ["Red", "Vermelho", "Rojo", "Rouge", "Rosso", "Червоний"],
  ["General", "Geral", "General", "Général", "Generale", "Загальне"],
  ["Check-out", "Check-out", "Salida", "Départ", "Check-out", "Виселення"],
  ["Deep clean", "Limpeza profunda", "Limpieza a fondo", "Grand ménage", "Pulizia profonda", "Генеральне прибирання"],
  ["Bed-sheet change", "Troca de lençóis", "Cambio de sábanas", "Changement des draps", "Cambio lenzuola", "Заміна постільної білизни"],
  ["At office", "No escritório", "En la oficina", "Au bureau", "In ufficio", "В офісі"],
  ["With cleaner", "Com a limpeza", "Con limpieza", "Chez l'agent", "Con l'addetto", "У прибиральника"],
  ["With guest", "Com o hóspede", "Con el huésped", "Chez le client", "Con l'ospite", "У гостя"],
  ["Missing", "Em falta", "Desaparecidas", "Manquantes", "Mancanti", "Відсутні"],
  ["Cleaning", "Limpeza", "Limpieza", "Ménage", "Pulizie", "Прибирання"],
  ["Maintenance", "Manutenção", "Mantenimiento", "Maintenance", "Manutenzione", "Обслуговування"],
  ["Staff (cleaner/maintenance)", "Equipa (limpeza/manutenção)", "Personal (limpieza/mantenimiento)", "Personnel (ménage/maintenance)", "Personale (pulizie/manutenzione)", "Персонал (прибирання/обслуговування)"],

  // ---- demo content (tickets, materials, notes) ----
  ["Balcony chair leg snapped — safety risk", "Perna da cadeira da varanda partida — risco de segurança", "Pata de la silla del balcón rota: riesgo de seguridad", "Pied de chaise du balcon cassé — risque de sécurité", "Gamba della sedia del balcone rotta: rischio per la sicurezza", "Зламана ніжка стільця на балконі — ризик для безпеки"],
  ["Leaking pipe under the sink, water on floor", "Cano a pingar debaixo do lava-loiça, água no chão", "Tubería con fuga bajo el fregadero, agua en el suelo", "Fuite sous l'évier, eau sur le sol", "Tubo che perde sotto il lavandino, acqua sul pavimento", "Тече труба під раковиною, вода на підлозі"],
  ["Oven won't heat up", "O forno não aquece", "El horno no calienta", "Le four ne chauffe pas", "Il forno non scalda", "Духовка не нагрівається"],
  ["Wardrobe door off its hinge", "Porta do roupeiro fora da dobradiça", "Puerta del armario fuera de la bisagra", "Porte de l'armoire sortie de sa charnière", "Anta dell'armadio uscita dal cardine", "Дверцята шафи зійшли з петель"],
  ["Air-con remote not responding", "O comando do ar condicionado não responde", "El mando del aire acondicionado no responde", "La télécommande de la clim ne répond pas", "Il telecomando del condizionatore non risponde", "Пульт кондиціонера не працює"],
  ["Shower head replaced", "Chuveiro substituído", "Alcachofa de ducha sustituida", "Pommeau de douche remplacé", "Soffione della doccia sostituito", "Лійку душу замінено"],
  ["Toilet cistern keeps running", "O autoclismo não para de correr", "La cisterna del váter no deja de correr", "La chasse d'eau coule en continu", "Lo sciacquone continua a perdere", "Бачок унітаза постійно тече"],
  ["Dishwasher not draining", "A máquina de lavar loiça não escoa", "El lavavajillas no desagua", "Le lave-vaisselle ne vidange pas", "La lavastoviglie non scarica", "Посудомийка не зливає воду"],
  ["Bedside lamp not working", "O candeeiro de cabeceira não funciona", "La lámpara de la mesilla no funciona", "La lampe de chevet ne fonctionne pas", "La lampada da comodino non funziona", "Нічна лампа не працює"],
  ["Sofa cushion zip broken", "Fecho da almofada do sofá partido", "Cremallera del cojín del sofá rota", "Fermeture éclair du coussin du canapé cassée", "Cerniera del cuscino del divano rotta", "Зламана блискавка на подушці дивана"],
  ["Gate latch is loose", "O trinco do portão está solto", "El pestillo de la puerta está suelto", "Le loquet du portail est desserré", "Il chiavistello del cancello è allentato", "Засув хвіртки хитається"],
  ["No hot water in shower", "Sem água quente no duche", "No hay agua caliente en la ducha", "Pas d'eau chaude dans la douche", "Niente acqua calda nella doccia", "У душі немає гарячої води"],
  ["Fridge making loud noise", "O frigorífico faz muito barulho", "La nevera hace mucho ruido", "Le frigo fait beaucoup de bruit", "Il frigorifero fa molto rumore", "Холодильник сильно шумить"],
  ["Window won't close fully", "A janela não fecha completamente", "La ventana no cierra del todo", "La fenêtre ne ferme pas complètement", "La finestra non si chiude del tutto", "Вікно не зачиняється повністю"],
  ["Bathroom disinfectant x2, bin bags", "Desinfetante de casa de banho x2, sacos do lixo", "Desinfectante de baño x2, bolsas de basura", "Désinfectant salle de bain x2, sacs-poubelle", "Disinfettante bagno x2, sacchi della spazzatura", "Дезінфектор для ванної x2, пакети для сміття"],
  ["Microfibre cloths x6, glass cleaner", "Panos de microfibra x6, limpa-vidros", "Paños de microfibra x6, limpiacristales", "Chiffons microfibre x6, nettoyant vitres", "Panni in microfibra x6, detergente per vetri", "Серветки з мікрофібри x6, засіб для скла"],
  ["Dishwasher tablets", "Pastilhas para máquina de loiça", "Pastillas para lavavajillas", "Pastilles pour lave-vaisselle", "Pastiglie per lavastoviglie", "Таблетки для посудомийки"],
  ["Toilet paper x12", "Papel higiénico x12", "Papel higiénico x12", "Papier toilette x12", "Carta igienica x12", "Туалетний папір x12"],
  ["Laundry detergent", "Detergente da roupa", "Detergente para la ropa", "Lessive", "Detersivo per il bucato", "Пральний порошок"],
  ["Bin bags (large)", "Sacos do lixo (grandes)", "Bolsas de basura (grandes)", "Sacs-poubelle (grands)", "Sacchi della spazzatura (grandi)", "Пакети для сміття (великі)"],
  ["Floor cleaner x2", "Limpa-chãos x2", "Limpiasuelos x2", "Nettoyant sols x2", "Detergente pavimenti x2", "Засіб для підлоги x2"],
  ["Sponges & scourers", "Esponjas e esfregões", "Esponjas y estropajos", "Éponges et grattoirs", "Spugne e spugnette abrasive", "Губки та скрабери"],
  ["Hand soap refills", "Recargas de sabonete", "Recambios de jabón de manos", "Recharges de savon pour les mains", "Ricariche di sapone per le mani", "Рідке мило (запаска)"],
  ["Coffee pods x30", "Cápsulas de café x30", "Cápsulas de café x30", "Capsules de café x30", "Cialde di caffè x30", "Капсули для кави x30"],
  ["Fresh towels x8", "Toalhas lavadas x8", "Toallas limpias x8", "Serviettes propres x8", "Asciugamani puliti x8", "Чисті рушники x8"],
  ["Same-day check-in at 15:00 — please prioritise", "Check-in no próprio dia às 15:00 — dar prioridade", "Check-in el mismo día a las 15:00: dar prioridad", "Arrivée le jour même à 15h00 — à traiter en priorité", "Check-in in giornata alle 15:00: dare priorità", "Заселення сьогодні о 15:00 — потрібен пріоритет"],
  ["Guest reported a broken chair on the balcony", "O hóspede reportou uma cadeira partida na varanda", "El huésped informó de una silla rota en el balcón", "Le client a signalé une chaise cassée sur le balcon", "L'ospite ha segnalato una sedia rotta sul balcone", "Гість повідомив про зламаний стілець на балконі"],
  ["Sign in with the username and password your administrator gave you.", "Inicie sessão com o utilizador e a palavra-passe que o administrador lhe deu.", "Inicia sesión con el usuario y la contraseña que te dio el administrador.", "Connectez-vous avec l'identifiant et le mot de passe fournis par votre administrateur.", "Accedi con il nome utente e la password che ti ha dato l'amministratore.", "Увійдіть із іменем користувача та паролем, які вам дав адміністратор."],
  ["No account yet? Ask your administrator.", "Ainda não tem conta? Peça ao administrador.", "¿Aún no tienes cuenta? Pídesela al administrador.", "Pas encore de compte ? Demandez à votre administrateur.", "Non hai ancora un account? Chiedilo all'amministratore.", "Ще немає облікового запису? Зверніться до адміністратора."],
  ["No connection. Please try again.", "Sem ligação. Tente novamente.", "Sin conexión. Inténtalo de nuevo.", "Pas de connexion. Veuillez réessayer.", "Nessuna connessione. Riprova.", "Немає з'єднання. Спробуйте ще раз."],
  ["Please sign in first.", "Inicie sessão primeiro.", "Inicia sesión primero.", "Veuillez d'abord vous connecter.", "Accedi prima.", "Спершу увійдіть."],
  ["That username is already taken.", "Esse utilizador já existe.", "Ese usuario ya existe.", "Cet identifiant est déjà pris.", "Questo nome utente è già in uso.", "Це ім'я користувача вже зайняте."],
  ["New password (leave empty to keep the current one)", "Nova palavra-passe (deixe vazio para manter a atual)", "Nueva contraseña (déjalo vacío para mantener la actual)", "Nouveau mot de passe (laisser vide pour garder l'actuel)", "Nuova password (lascia vuoto per mantenere quella attuale)", "Новий пароль (залиште порожнім, щоб зберегти поточний)"],
  ["At least 8 characters.", "Pelo menos 8 caracteres.", "Al menos 8 caracteres.", "Au moins 8 caractères.", "Almeno 8 caratteri.", "Щонайменше 8 символів."],
  ["Change anyone's role anytime. Everyone signs in with their own username and password; add people with Add staff.", "Pode mudar a função de qualquer pessoa a qualquer momento. Todos entram com o seu próprio utilizador e palavra-passe; adicione pessoas com Adicionar funcionário.", "Puedes cambiar el rol de cualquiera en cualquier momento. Todos inician sesión con su propio usuario y contraseña; añade personas con Añadir personal.", "Changez le rôle de chacun à tout moment. Chacun se connecte avec son propre identifiant et mot de passe ; ajoutez des personnes avec Ajouter un membre.", "Puoi cambiare il ruolo di chiunque in qualsiasi momento. Tutti accedono con il proprio nome utente e password; aggiungi persone con Aggiungi addetto.", "Ви можете змінити роль будь-кого в будь-який час. Кожен входить зі своїм іменем користувача та паролем; додавайте людей через «Додати працівника»."],
];

const ORDER: Lang[] = ["en", "pt", "es", "fr", "it", "uk"];
const DICT: Record<string, Record<string, string>> = {};
for (const row of ROWS) {
  ORDER.forEach((l, i) => {
    if (l === "en") return;
    (DICT[l] ??= {})[row[0]] = row[i];
  });
}

// DB enum code -> English label (then translated through DICT)
const ENUM_EN: Record<string, string> = {
  SCHEDULED: "Scheduled", ASSIGNED: "Assigned", IN_PROGRESS: "In progress", ON_HOLD: "On hold",
  COMPLETED: "Completed", TO_BE_VERIFIED: "To be verified", APPROVED: "Approved", WITH_ISSUE: "With issue",
  OPEN: "Open", ACCEPTED: "Accepted", REJECTED: "Rejected", CLOSED: "Closed",
  YELLOW: "Yellow", ORANGE: "Orange", RED: "Red",
  GENERAL: "General", CHECKOUT: "Check-out", DEEP_CLEAN: "Deep clean", OUTDOOR: "Outdoor", BEDSHEET_CHANGE: "Bed-sheet change",
  AT_OFFICE: "At office", WITH_CLEANER: "With cleaner", WITH_GUEST: "With guest", MISSING: "Missing",
  CLEANING: "Cleaning", MAINTENANCE: "Maintenance",
  worker: "Staff (cleaner/maintenance)", manager: "Manager", coordinator: "Coordinator", admin: "Super Admin",
};

type Ctx = {
  lang: Lang;
  locale: string;
  setLang: (l: Lang, opts?: { persist?: boolean }) => void;
  tr: (s: string, vars?: Record<string, string | number>) => string;
  ev: (code: string) => string;
};

const I18nContext = createContext<Ctx | null>(null);

const isLang = (v: string | null): v is Lang => !!v && LANGS.some((l) => l.code === v);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Stored choice wins; otherwise follow the phone/browser language.
  useEffect(() => {
    const stored = localStorage.getItem("lang");
    if (isLang(stored)) return setLangState(stored);
    const nav = (navigator.language || "en").slice(0, 2);
    if (isLang(nav)) setLangState(nav);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang, opts?: { persist?: boolean }) => {
    setLangState(l);
    localStorage.setItem("lang", l);
    // Keep the worker's saved profile language in step with the switch.
    const workerId = localStorage.getItem("workerId");
    if (workerId && opts?.persist !== false) {
      fetch(`/api/workers/${workerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: l }),
      }).catch(() => {});
    }
  }, []);

  const value = useMemo<Ctx>(() => {
    const dict = DICT[lang] ?? {};
    const tr = (s: string, vars?: Record<string, string | number>) => {
      let out = dict[s] ?? s;
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
      return out;
    };
    const ev = (code: string) => tr(ENUM_EN[code] ?? code);
    const locale = LANGS.find((l) => l.code === lang)?.locale ?? "en-GB";
    return { lang, locale, setLang, tr, ev };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
