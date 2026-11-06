// Text of the phone notifications, in the RECIPIENT's saved language.
// (The server has to translate these itself because the person's phone is asleep
// when the message is sent.) Order of columns: en, pt, es, fr, it, uk.

type Lang = "en" | "pt" | "es" | "fr" | "it" | "uk";
const ORDER: Lang[] = ["en", "pt", "es", "fr", "it", "uk"];

type Row = { title: [string, string, string, string, string, string]; body: [string, string, string, string, string, string] };

export const PUSH_TEXT = {
  ticket_new: {
    title: ["New issue", "Novo problema", "Nueva incidencia", "Nouveau problème", "Nuovo problema", "Нова проблема"],
    body: ["{house}: {room}", "{house}: {room}", "{house}: {room}", "{house} : {room}", "{house}: {room}", "{house}: {room}"],
  },
  ticket_urgent: {
    title: ["🔴 Urgent issue", "🔴 Problema urgente", "🔴 Incidencia urgente", "🔴 Problème urgent", "🔴 Problema urgente", "🔴 Термінова проблема"],
    body: ["{house}: {room}", "{house}: {room}", "{house}: {room}", "{house} : {room}", "{house}: {room}", "{house}: {room}"],
  },
  task_review: {
    title: ["Ready for check-in review", "Pronto para verificar", "Listo para revisar", "Prêt à vérifier", "Pronto da verificare", "Готово до перевірки"],
    body: [
      "{house} is waiting for your check.", "{house} aguarda a sua verificação.", "{house} espera tu revisión.",
      "{house} attend votre vérification.", "{house} attende la tua verifica.", "{house} чекає на вашу перевірку.",
    ],
  },
  task_back: {
    title: ["Job sent back", "Tarefa devolvida", "Tarea devuelta", "Tâche renvoyée", "Attività rimandata", "Завдання повернено"],
    body: [
      "{house}: please check it again.", "{house}: por favor verifique de novo.", "{house}: por favor revísalo de nuevo.",
      "{house} : merci de vérifier à nouveau.", "{house}: controlla di nuovo, per favore.", "{house}: будь ласка, перевірте ще раз.",
    ],
  },
  task_new: {
    title: ["New job", "Nova tarefa", "Nueva tarea", "Nouvelle tâche", "Nuova attività", "Нове завдання"],
    body: ["{house} at {time}", "{house} às {time}", "{house} a las {time}", "{house} à {time}", "{house} alle {time}", "{house} на {time}"],
  },
  material_new: {
    title: ["Materials requested", "Materiais pedidos", "Materiales solicitados", "Matériel demandé", "Materiali richiesti", "Запит матеріалів"],
    body: ["{house}: {items}", "{house}: {items}", "{house}: {items}", "{house} : {items}", "{house}: {items}", "{house}: {items}"],
  },
  ticket_review: {
    title: ["Repair finished — please check", "Reparação concluída — verifique", "Reparación terminada: revísala", "Réparation terminée — à vérifier", "Riparazione finita — da verificare", "Ремонт завершено — перевірте"],
    body: [
      "{house} is waiting for your check.", "{house} aguarda a sua verificação.", "{house} espera tu revisión.",
      "{house} attend votre vérification.", "{house} attende la tua verifica.", "{house} чекає на вашу перевірку.",
    ],
  },
  ticket_back: {
    title: ["Repair sent back", "Reparação devolvida", "Reparación devuelta", "Réparation renvoyée", "Riparazione rimandata", "Ремонт повернено"],
    body: [
      "{house}: please check it again.", "{house}: por favor verifique de novo.", "{house}: por favor revísalo de nuevo.",
      "{house} : merci de vérifier à nouveau.", "{house}: controlla di nuovo, per favore.", "{house}: будь ласка, перевірте ще раз.",
    ],
  },
  ticket_closed: {
    title: ["Issue fixed", "Problema resolvido", "Incidencia resuelta", "Problème résolu", "Problema risolto", "Проблему вирішено"],
    body: [
      "{house}: the issue you reported was closed.", "{house}: o problema que reportou foi fechado.",
      "{house}: la incidencia que comunicaste se cerró.", "{house} : le problème que vous avez signalé est clos.",
      "{house}: il problema che hai segnalato è stato chiuso.", "{house}: проблему, про яку ви повідомили, закрито.",
    ],
  },
  ticket_rejected: {
    title: ["Issue not taken", "Problema não aceite", "Incidencia rechazada", "Problème refusé", "Problema rifiutato", "Проблему відхилено"],
    body: [
      "{house}: maintenance rejected the issue you reported.", "{house}: a manutenção rejeitou o problema que reportou.",
      "{house}: mantenimiento rechazó la incidencia que comunicaste.", "{house} : la maintenance a refusé le problème que vous avez signalé.",
      "{house}: la manutenzione ha rifiutato il problema che hai segnalato.", "{house}: технічна служба відхилила проблему, про яку ви повідомили.",
    ],
  },
  ticket_rejected_office: {
    title: ["Ticket rejected", "Ticket rejeitado", "Ticket rechazado", "Ticket refusé", "Ticket rifiutato", "Тікет відхилено"],
    body: [
      "{house}: a maintenance ticket was rejected. Reopen or reassign it.", "{house}: um ticket de manutenção foi rejeitado. Reabra ou reatribua.",
      "{house}: se rechazó un ticket de mantenimiento. Reábrelo o reasígnalo.", "{house} : un ticket de maintenance a été refusé. Rouvrez-le ou réassignez-le.",
      "{house}: un ticket di manutenzione è stato rifiutato. Riaprilo o riassegnalo.", "{house}: тікет технічної служби відхилено. Відновіть або перепризначте.",
    ],
  },
  task_changed: {
    title: ["Job updated", "Tarefa atualizada", "Tarea actualizada", "Tâche modifiée", "Attività aggiornata", "Завдання оновлено"],
    body: ["{house} at {time}: details changed.", "{house} às {time}: os detalhes mudaram.", "{house} a las {time}: han cambiado los detalles.", "{house} à {time} : les détails ont changé.", "{house} alle {time}: i dettagli sono cambiati.", "{house} на {time}: деталі змінено."],
  },
  task_unassigned: {
    title: ["Job removed from you", "Tarefa retirada", "Tarea retirada", "Tâche retirée", "Attività rimossa", "Завдання знято"],
    body: ["{house} was given to someone else.", "{house} foi atribuída a outra pessoa.", "{house} se asignó a otra persona.", "{house} a été confiée à quelqu'un d'autre.", "{house} è stata assegnata a qualcun altro.", "{house} передано іншій особі."],
  },
  task_deleted: {
    title: ["Job cancelled", "Tarefa cancelada", "Tarea cancelada", "Tâche annulée", "Attività annullata", "Завдання скасовано"],
    body: ["{house} at {time} was cancelled.", "{house} às {time} foi cancelada.", "{house} a las {time} se canceló.", "{house} à {time} a été annulée.", "{house} alle {time} è stata annullata.", "{house} на {time} скасовано."],
  },
  task_approved: {
    title: ["Job approved ✓", "Tarefa aprovada ✓", "Tarea aprobada ✓", "Tâche validée ✓", "Attività approvata ✓", "Завдання схвалено ✓"],
    body: ["{house} was checked and approved.", "{house} foi verificada e aprovada.", "{house} fue revisada y aprobada.", "{house} a été vérifiée et validée.", "{house} è stata verificata e approvata.", "{house} перевірено та схвалено."],
  },
  ticket_assigned: {
    title: ["Repair assigned to you", "Reparação atribuída a si", "Reparación asignada a ti", "Réparation qui vous est assignée", "Riparazione assegnata a te", "Вам призначено ремонт"],
    body: ["{house}: {room}", "{house}: {room}", "{house}: {room}", "{house} : {room}", "{house}: {room}", "{house}: {room}"],
  },
  ticket_changed: {
    title: ["Repair updated", "Reparação atualizada", "Reparación actualizada", "Réparation modifiée", "Riparazione aggiornata", "Ремонт оновлено"],
    body: ["{house}: details changed.", "{house}: os detalhes mudaram.", "{house}: han cambiado los detalles.", "{house} : les détails ont changé.", "{house}: i dettagli sono cambiati.", "{house}: деталі змінено."],
  },
  ticket_unassigned: {
    title: ["Repair removed from you", "Reparação retirada", "Reparación retirada", "Réparation retirée", "Riparazione rimossa", "Ремонт знято"],
    body: ["{house}: given to someone else.", "{house}: atribuída a outra pessoa.", "{house}: asignada a otra persona.", "{house} : confiée à quelqu'un d'autre.", "{house}: assegnata a qualcun altro.", "{house}: передано іншій особі."],
  },
  ticket_deleted: {
    title: ["Repair deleted", "Reparação eliminada", "Reparación eliminada", "Réparation supprimée", "Riparazione eliminata", "Ремонт видалено"],
    body: ["{house}: this ticket no longer exists.", "{house}: este ticket já não existe.", "{house}: este ticket ya no existe.", "{house} : ce ticket n'existe plus.", "{house}: questo ticket non esiste più.", "{house}: цього тікета більше немає."],
  },
  ticket_reopened: {
    title: ["Repair back in the queue", "Reparação de volta à fila", "Reparación de vuelta en la cola", "Réparation de retour dans la file", "Riparazione di nuovo in coda", "Ремонт повернуто в чергу"],
    body: ["{house}: {room}", "{house}: {room}", "{house}: {room}", "{house} : {room}", "{house}: {room}", "{house}: {room}"],
  },
  ticket_accepted: {
    title: ["Issue taken", "Problema aceite", "Incidencia aceptada", "Problème pris en charge", "Problema preso in carico", "Проблему прийнято"],
    body: ["{house}: maintenance is on it.", "{house}: a manutenção está a tratar disso.", "{house}: mantenimiento se está ocupando.", "{house} : la maintenance s'en occupe.", "{house}: la manutenzione se ne sta occupando.", "{house}: технічна служба вже працює над цим."],
  },
  key_missing: {
    title: ["Key missing", "Chave em falta", "Falta una llave", "Clé manquante", "Chiave mancante", "Ключ відсутній"],
    body: [
      "The key of {house} is marked as missing.", "A chave de {house} está marcada como em falta.",
      "La llave de {house} está marcada como perdida.", "La clé de {house} est marquée comme manquante.",
      "La chiave di {house} è segnata come mancante.", "Ключ від {house} позначено як відсутній.",
    ],
  },
  test: {
    title: ["WakeUp", "WakeUp", "WakeUp", "WakeUp", "WakeUp", "WakeUp"],
    body: [
      "Notifications are working ✓", "As notificações estão a funcionar ✓", "Las notificaciones funcionan ✓",
      "Les notifications fonctionnent ✓", "Le notifiche funzionano ✓", "Сповіщення працюють ✓",
    ],
  },
} satisfies Record<string, Row>;

export type PushKey = keyof typeof PUSH_TEXT;

export function pushText(key: PushKey, lang: string, params: Record<string, string | number> = {}) {
  const i = Math.max(0, ORDER.indexOf(lang as Lang)); // unknown language → English
  const fill = (s: string) => Object.entries(params).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v)), s);
  return { title: fill(PUSH_TEXT[key].title[i]), body: fill(PUSH_TEXT[key].body[i]) };
}
