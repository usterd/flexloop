/* =========================================================================
   i18n.js — the two languages the interface speaks.

   Every string the app puts on screen lives here, English first, German
   second: STRINGS holds one array per key in the order of ORDER, so a
   translation sits on the same line as the sentence it translates and the
   two cannot drift apart unnoticed.

   Three ways in:
     · t(key, vars)         one string, with {placeholders} filled in
     · plural(key, n, vars) picks key.one or key.other and passes {n}
     · list(key)            an array — the info sheets and the motivations

   Nothing here escapes anything. The views escape on the way out exactly as
   they did when the sentences were inline, and a `vars` value may therefore
   carry markup the caller has already built and escaped.

   The chosen language is a setting like the theme, resolved once at boot and
   again whenever the topbar toggle is tapped; views are rebuilt from strings
   on every render, so there is nothing to invalidate beyond re-rendering.
   ========================================================================= */

export const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
];

export const DEFAULT_LANG = 'en';

/** Index into every entry of STRINGS. */
const ORDER = ['en', 'de'];

/** Date and number formatting follows the language, not the handset. */
const LOCALES = { en: 'en-GB', de: 'de-DE' };

let current = DEFAULT_LANG;

export const getLang = () => current;

export function setLang(id) {
  current = LANGS.some((l) => l.id === id) ? id : DEFAULT_LANG;
  return current;
}

/** The BCP 47 tag toLocaleDateString should use — never the device's own. */
export const locale = () => LOCALES[current] || LOCALES.en;

/** Decimal comma in German, decimal point in English. */
export const decimalSep = () => (current === 'de' ? ',' : '.');

const fill = (s, vars) => (vars
  ? String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])))
  : String(s));

export function t(key, vars) {
  const row = STRINGS[key];
  if (!row) return key;                       // a missing key names itself
  const i = ORDER.indexOf(current);
  return fill(row[i] != null ? row[i] : row[0], vars);
}

/**
 * English has one plural rule and German has the same one, so a single
 * one/other split covers both. `n` is always available as {n}.
 */
export function plural(key, n, vars) {
  return t(`${key}.${Number(n) === 1 ? 'one' : 'other'}`, Object.assign({ n }, vars));
}

/**
 * Every language's version of one key. For the few places that have to
 * recognise a string the app itself wrote earlier — possibly in the other
 * language, since a muscle group is stored as words rather than as a key.
 */
export const variants = (key) => (STRINGS[key] || []).slice();

/** The list under `key`, falling back to English if it has no translation. */
export function list(key) {
  const row = LISTS[key];
  if (!row) return [];
  return row[current] || row.en || [];
}

/* =========================================================================
   STRINGS.  [ en, de ]
   ========================================================================= */

const STRINGS = {
  /* ----------------------------------------------------------- generic */
  'action.cancel': ['Cancel', 'Abbrechen'],
  'action.save': ['Save', 'Speichern'],
  'action.confirm': ['Confirm', 'Bestätigen'],
  'action.delete': ['Delete', 'Löschen'],
  'action.remove': ['Remove', 'Entfernen'],
  'action.done': ['Done', 'Fertig'],
  'action.close': ['Close', 'Schließen'],
  'action.gotIt': ['Got it', 'Verstanden'],
  'action.back': ['Back', 'Zurück'],
  'action.add': ['Add', 'Hinzufügen'],
  'action.create': ['Create', 'Erstellen'],
  'action.rename': ['Rename', 'Umbenennen'],
  'action.edit': ['Edit', 'Bearbeiten'],
  'action.import': ['Import', 'Importieren'],
  'action.reload': ['Reload', 'Neu laden'],
  'action.change': ['change', 'ändern'],
  'action.dismiss': ['Dismiss', 'Ausblenden'],
  'action.options': ['Options', 'Optionen'],

  'word.new': ['new', 'neu'],
  'word.recent': ['Recent', 'Zuletzt'],
  'word.reps': ['Reps', 'Wdh.'],
  'word.bodyweight': ['bodyweight', 'Körpergewicht'],
  'word.imported': ['imported', 'importiert'],
  'word.sample': ['sample', 'Beispiel'],
  'word.current': ['current', 'aktuell'],
  'word.noData': ['no data', 'keine Daten'],
  'word.total': ['Total', 'Gesamt'],
  'word.offline': ['offline', 'offline'],

  /* ------------------------------------------------------------ counts */
  'count.sessions.one': ['{n} session', '{n} Einheit'],
  'count.sessions.other': ['{n} sessions', '{n} Einheiten'],
  'count.sets.one': ['{n} set', '{n} Satz'],
  'count.sets.other': ['{n} sets', '{n} Sätze'],
  'count.exercises.one': ['{n} exercise', '{n} Übung'],
  'count.exercises.other': ['{n} exercises', '{n} Übungen'],
  'count.routines.one': ['{n} routine', '{n} Routine'],
  'count.routines.other': ['{n} routines', '{n} Routinen'],
  'count.reps': ['{n} reps', '{n} Wdh.'],
  'count.deletedExercises.one': ['{n} deleted exercise', '{n} gelöschte Übung'],
  'count.deletedExercises.other': ['{n} deleted exercises', '{n} gelöschte Übungen'],

  /* -------------------------------------------------------------- time */
  'time.minutes': ['{n} min', '{n} Min'],
  'time.hoursMinutes': ['{h}h {m}m', '{h} Std {m} Min'],
  'time.today': ['today', 'heute'],
  'time.yesterday': ['yesterday', 'gestern'],
  'time.daysAgo': ['{n} days ago', 'vor {n} Tagen'],
  'time.lastWeek': ['last week', 'letzte Woche'],
  'time.weeksAgo': ['{n} weeks ago', 'vor {n} Wochen'],
  'time.monthsAgo': ['{n} months ago', 'vor {n} Monaten'],
  'time.seconds': ['{n}s', '{n} s'],
  'time.minutesOnly': ['{m} min', '{m} Min'],
  'time.minutesSeconds': ['{m} min {s}s', '{m} Min {s} s'],

  /* --------------------------------------------------------- app shell */
  'app.description': ['Offline gym journal.', 'Offline-Trainingstagebuch.'],
  'app.wordmarkLink': ['Open the flexloop project page',
    'Die flexloop-Projektseite öffnen'],
  'tab.log': ['Log', 'Training'],
  'tab.history': ['History', 'Verlauf'],
  'tab.progress': ['Progress', 'Fortschritt'],
  'tab.settings': ['Settings', 'Einstellungen'],
  'rest.label': ['Rest', 'Pause'],
  'rest.add30': ['+30s', '+30 s'],
  'rest.skip': ['Skip', 'Überspringen'],
  'rest.done': ['Rest done', 'Pause vorbei'],

  'theme.dark': ['Dark', 'Dunkel'],
  'theme.light': ['Light', 'Hell'],
  'theme.auto': ['Match system', 'Wie das System'],
  'theme.toLight': ['Switch to light mode', 'Zum hellen Design wechseln'],
  'theme.toDark': ['Switch to dark mode', 'Zum dunklen Design wechseln'],
  'theme.sun': ['sun', 'Sonne'],
  'theme.moon': ['moon', 'Mond'],

  /* Settings → Appearance → Text size. The steps are printed as the px they
     add, since that is exactly what they do — there is no "medium" here. */
  'textSize.none': ['Default', 'Standard'],
  'textSize.plus': ['+{n} px', '+{n} px'],

  /* The label describes the language you would get, so each side names the
     other one — in the language currently on screen. */
  'lang.toggle': ['Switch to German', 'Auf Englisch umschalten'],
  /* What the toggle prints: the language it would switch you to. */
  'lang.otherShort': ['DE', 'EN'],

  'nav.notFound': ['Nothing here', 'Hier ist nichts'],
  'nav.notFoundBody': ["That screen doesn't exist.", 'Diesen Bildschirm gibt es nicht.'],
  'nav.goToLog': ['Go to Log', 'Zum Training'],
  'nav.about': ['About {title}', 'Über {title}'],

  /* ----------------------------------------------------------- the Log */
  'log.eyebrowToday': ['Today', 'Heute'],
  'log.eyebrowInProgress': ['In progress', 'Läuft gerade'],
  'log.lastSession': ['Last session {when} — {summary}.',
    'Letzte Einheit {when} — {summary}.'],
  'log.noneYet': ['No sessions logged yet. The first one sets your baseline.',
    'Noch keine Einheit aufgezeichnet. Die erste setzt deine Ausgangslage.'],
  'log.start': ['Start session', 'Einheit starten'],
  'log.startSub': ['Pick exercises manually', 'Übungen selbst auswählen'],
  'log.loadDemo': ['Load sample data', 'Beispieldaten laden'],
  'log.finishedToday': ['Finished today', 'Heute beendet'],
  'log.counts': ['{sessions} sessions · {exercises} exercises',
    '{sessions} Einheiten · {exercises} Übungen'],
  'log.finish': ['Finish', 'Beenden'],
  'log.finishSession': ['Finish session', 'Einheit beenden'],
  'log.discardSession': ['Discard session', 'Einheit verwerfen'],
  'log.addExercise': ['+ Add exercise', '+ Übung hinzufügen'],
  'log.saveAsRoutine': ['Save as routine', 'Als Routine speichern'],
  'log.notes': ['Session notes', 'Notizen zur Einheit'],
  'log.notesPlaceholder': ['Felt strong, bar speed good…',
    'Fühlte mich stark, Hantel lief schnell…'],
  'log.notesEmpty': ['Nothing noted', 'Nichts notiert'],
  'log.emptySoFar': ['Empty so far', 'Bisher leer'],
  'log.ghostFirst': ['First time logging this', 'Zum ersten Mal aufgezeichnet'],
  'log.ghostLast': ['Last {value} · {when}', 'Zuletzt {value} · {when}'],
  'log.startFromRoutine': ['Start from a routine', 'Mit einer Routine starten'],
  'log.allRoutines': ['All {n} routines', 'Alle {n} Routinen'],
  'log.addSet': ['+ Set', '+ Satz'],
  'log.addWarmup': ['+ Warmup', '+ Aufwärmen'],
  'log.exerciseOptions': ['Exercise options', 'Optionen der Übung'],
  'log.seeProgress': ['{name} — see progress', '{name} — Fortschritt ansehen'],

  'set.warmupShort': ['W', 'A'],
  'set.lessWeight': ['Less weight', 'Weniger Gewicht'],
  'set.moreWeight': ['More weight', 'Mehr Gewicht'],
  'set.fewerReps': ['Fewer reps', 'Weniger Wiederholungen'],
  'set.moreReps': ['More reps', 'Mehr Wiederholungen'],
  'set.weightIn': ['Weight in {unit}', 'Gewicht in {unit}'],
  'set.repsAria': ['Reps', 'Wiederholungen'],
  'set.markDone': ['Mark set done', 'Satz als erledigt markieren'],

  /* --------------------------------------------------------- the boost */
  'boost.beat': ['Beat {value}', 'Schlag {value}'],
  'boost.at': [' at {weight}', ' bei {weight}'],
  /* Between the two ways to clear an e1RM target: "95×6 or 97.5×5". */
  'boost.or': [' or ', ' oder '],
  'boost.tryWeight': ['try {weight}', 'versuch {weight}'],
  'boost.tryReps': ['try {reps}', 'versuch {reps}'],
  'boost.moreSets.one': ['{n} more set of {reps}', '{n} Satz mehr à {reps}'],
  'boost.moreSets.other': ['{n} more sets of {reps}', '{n} Sätze mehr à {reps}'],
  'boost.setsOf': ['sets of {reps}', 'Sätze à {reps}'],
  'boost.setOf': ['set of {reps}', 'Satz à {reps}'],
  'boost.pastBest': ['past your best', 'über deiner Bestleistung'],
  'boost.pastLast': ['past last time', 'über dem letzten Mal'],
  'boost.climbing': ['{n} sessions climbing', '{n} Einheiten im Aufwärtstrend'],
  'boost.newBest': ['New best', 'Neue Bestleistung'],
  'boost.beatLast': ['Past last time', 'Besser als letztes Mal'],
  'boost.toast': ['{what} — {value} {metric}', '{what} — {value} {metric}'],

  /* ------------------------------------------------------------ metrics */
  'metric.off.label': ['None', 'Keiner'],
  'metric.off.short': ['', ''],
  'metric.e1rm.label': ['Estimated 1RM', 'Geschätztes 1RM'],
  'metric.e1rm.short': ['e1RM', 'e1RM'],
  'metric.weight.label': ['Heaviest set', 'Schwerster Satz'],
  'metric.weight.short': ['top set', 'schwerster Satz'],
  'metric.reps.label': ['Reps at your working weight', 'Wdh. beim Arbeitsgewicht'],
  'metric.reps.short': ['reps', 'Wdh.'],
  'metric.volume.label': ['Volume this session', 'Volumen dieser Einheit'],
  'metric.volume.short': ['volume', 'Volumen'],

  'maMode.off': ['None', 'Keine'],
  'maMode.sma': ['Simple moving average', 'Einfacher gleitender Durchschnitt'],
  'maMode.ema': ['Exponential moving average', 'Exponentieller gleitender Durchschnitt'],

  'boostNote.off': ['No target line. The Log shows only what you lifted last time.',
    'Keine Zielzeile. Das Training zeigt nur, was du letztes Mal gehoben hast.'],
  'boostNote.e1rm': ['Epley, weight × (1 + reps / 30), on your best set. Both more weight and more reps beat it, so the line offers each.',
    'Epley, Gewicht × (1 + Wdh. / 30), auf deinem besten Satz. Mehr Gewicht und mehr Wiederholungen schlagen es beide, also bietet die Zeile beides an.'],
  'boostNote.weight': ['The heaviest single set you have done, whatever the reps. Beaten by one more notch of the weight step.',
    'Der schwerste Einzelsatz, den du gemacht hast, egal bei wie vielen Wiederholungen. Geschlagen von einer weiteren Stufe der Gewichtsschrittweite.'],
  'boostNote.reps': ['The most reps you have managed at the weight you are working at today, or heavier.',
    'Die meisten Wiederholungen, die du beim heutigen Arbeitsgewicht oder schwerer geschafft hast.'],
  'boostNote.volume': ['Σ weight × reps over the whole exercise in one session. Beaten by an extra set as readily as a heavier one.',
    'Σ Gewicht × Wdh. über die ganze Übung in einer Einheit. Ein zusätzlicher Satz schlägt es genauso wie ein schwererer.'],

  /* ------------------------------------------------------- the pickers */
  'picker.title': ['Add exercise', 'Übung hinzufügen'],
  'picker.search': ['Search or type a new name', 'Suchen oder neuen Namen eingeben'],
  'picker.create': ['Create “{name}”', '„{name}“ anlegen'],
  'picker.createSub': ['Adds it to your exercise list', 'Fügt sie deiner Übungsliste hinzu'],
  'picker.empty': ['Type a name to create your first exercise.',
    'Gib einen Namen ein, um deine erste Übung anzulegen.'],
  'exercise.uncategorised': ['Uncategorised', 'Ohne Kategorie'],
  'exercise.removed': ['Removed exercise', 'Gelöschte Übung'],

  /* ------------------------------------------------------- the session */
  'session.notFound': ['Session not found', 'Einheit nicht gefunden'],
  'session.maybeDeleted': ['It may have been deleted.', 'Sie wurde vielleicht gelöscht.'],
  'session.backToHistory': ['Back to history', 'Zurück zum Verlauf'],
  'session.completed': ['Completed', 'Abgeschlossen'],
  'session.deleteThis': ['Delete this session', 'Diese Einheit löschen'],
  'session.deleteTitle': ['Delete this session?', 'Diese Einheit löschen?'],
  'session.deleteBody': ['It is removed from your history and from every chart.',
    'Sie verschwindet aus deinem Verlauf und aus jedem Diagramm.'],
  'session.deleted': ['Session deleted', 'Einheit gelöscht'],
  'session.discardTitle': ['Discard this session?', 'Diese Einheit verwerfen?'],
  'session.discardBody': ['Everything logged in it is deleted.',
    'Alles darin Aufgezeichnete wird gelöscht.'],
  'session.discardConfirm': ['Discard', 'Verwerfen'],
  'session.discarded': ['Session discarded', 'Einheit verworfen'],
  'session.nothingDone': ['Nothing marked done', 'Nichts abgehakt'],
  'session.nothingDoneBody': ['No completed sets in this session. Finish it anyway, or go back and tick your sets?',
    'Keine erledigten Sätze in dieser Einheit. Trotzdem beenden, oder zurück und die Sätze abhaken?'],
  'session.finishAnyway': ['Finish anyway', 'Trotzdem beenden'],
  'session.savedToast': ['Session saved — {summary}', 'Einheit gespeichert — {summary}'],
  'session.saved': ['Session saved', 'Einheit gespeichert'],
  'session.bestEver': ['{n} best ever', '{n}× Bestleistung'],

  /* ------------------------------------------------------- the history */
  'history.eyebrow': ['History', 'Verlauf'],
  'history.empty': ['No history yet', 'Noch kein Verlauf'],
  'history.emptyBody': ['Finished sessions collect here, newest first.',
    'Beendete Einheiten sammeln sich hier, die neueste zuerst.'],
  'history.startSession': ['Start a session', 'Einheit starten'],
  'history.sub': ['Tap any session to edit or delete it.',
    'Tippe eine Einheit an, um sie zu bearbeiten oder zu löschen.'],

  /* ------------------------------------------------------ the progress */
  'progress.eyebrow': ['Progress', 'Fortschritt'],
  'progress.overview': ['Overview', 'Überblick'],
  'progress.perExercise': ['Per exercise', 'Pro Übung'],
  'progress.noData': ['No data yet', 'Noch keine Daten'],
  'progress.noDataBody': ["Charts appear once you've logged a session. You can also import a backup from Settings.",
    'Diagramme erscheinen, sobald du eine Einheit aufgezeichnet hast. Du kannst auch ein Backup in den Einstellungen importieren.'],
  'progress.weekStreak': ['Week streak', 'Wochenserie'],
  'progress.weekShort': ['wk', 'Wo'],
  'progress.streakOn': ['consecutive weeks trained', 'Wochen in Folge trainiert'],
  'progress.streakOff': ['train this week to start one', 'trainiere diese Woche, um eine zu starten'],
  'progress.thisWeek': ['This week', 'Diese Woche'],
  'progress.moved': ['{volume} moved', '{volume} bewegt'],
  'progress.last12': ['Last 12 weeks', 'Letzte 12 Wochen'],
  'progress.sessionsLogged': ['sessions logged', 'Einheiten aufgezeichnet'],
  'progress.volume12': ['Volume 12wk', 'Volumen 12 Wo'],
  'progress.volumeNote': ['weight × reps, warmups out',
    'Gewicht × Wdh., ohne Aufwärmsätze'],
  'progress.sessionsPerWeek': ['Sessions per week', 'Einheiten pro Woche'],
  'progress.twelveWeeks': ['12 WK', '12 WO'],
  'progress.volumePerWeek': ['Volume per week', 'Volumen pro Woche'],
  'progress.weekOf': ['week of {label}', 'Woche ab {label}'],
  'progress.stale': ['Going stale', 'Länger nicht trainiert'],
  'progress.staleSub': ['Longest since you last trained it.',
    'Am längsten her, seit du es zuletzt trainiert hast.'],
  'progress.daysShort': ['days', 'Tage'],
  'progress.noExercises': ['No exercises yet', 'Noch keine Übungen'],
  'progress.noExercisesBody': ['Add one while logging a session and its charts build themselves.',
    'Füge während einer Einheit eine hinzu, dann bauen sich ihre Diagramme von selbst.'],
  'progress.notTrained': ['Not trained yet', 'Noch nicht trainiert'],
  'progress.notTrainedBody': ['Log a set of {name} and its history starts here.',
    'Zeichne einen Satz {name} auf, dann beginnt hier ihr Verlauf.'],
  'progress.bestSetReps': ['Best set reps', 'Wdh. im besten Satz'],
  'progress.repsAxis': ['REPS', 'WDH.'],
  'progress.epley': ['EPLEY · W × (1 + R/30)', 'EPLEY · G × (1 + W/30)'],
  'progress.everySet': ['Every set', 'Jeder Satz'],
  'progress.everySetNote': ['LINE REPS · BARS {unit}', 'LINIE WDH. · BALKEN {unit}'],
  'progress.volumePerSession': ['Volume per session', 'Volumen pro Einheit'],
  'progress.warmupsOut': ['{label} · WARMUPS OUT', '{label} · OHNE AUFWÄRMEN'],
  'progress.trendNeeds': ['{label} · NEEDS {n}+', '{label} · BRAUCHT {n}+'],
  'progress.warmupsExcluded': ['WARMUPS EXCLUDED', 'OHNE AUFWÄRMSÄTZE'],
  'progress.topSetWeight': ['Top set weight', 'Gewicht im schwersten Satz'],
  'progress.nextTarget': ['Next target', 'Nächstes Ziel'],
  'progress.nextTargetOf': ['Next target · {metric}', 'Nächstes Ziel · {metric}'],
  'progress.beats': ['beats {value}', 'schlägt {value}'],
  'progress.stood.one': ['stood {n} day', 'steht seit {n} Tag'],
  'progress.stood.other': ['stood {n} days', 'steht seit {n} Tagen'],
  'progress.records': ['Personal records', 'Bestleistungen'],
  'progress.bestE1rm': ['Best e1RM', 'Bestes e1RM'],
  'progress.heaviestPerReps': ['Heaviest at each rep count',
    'Schwerstes bei jeder Wiederholungszahl'],
  'progress.repsPlus': ['{n}+ reps', '{n}+ Wdh.'],
  'progress.setsLogged': ['{sessions} sessions · {sets} working sets logged',
    '{sessions} Einheiten · {sets} Arbeitssätze aufgezeichnet'],
  'progress.emptyWindow': ['No sessions in this window. Try a wider range.',
    'Keine Einheiten in diesem Zeitraum. Probier einen größeren Bereich.'],

  'window.1m': ['1M', '1M'],
  'window.3m': ['3M', '3M'],
  'window.6m': ['6M', '6M'],
  'window.1y': ['1Y', '1J'],
  'window.all': ['All', 'Alle'],

  /* ----------------------------------------------------- option lists */
  'options.edit': ['Edit this list…', 'Diese Liste bearbeiten…'],
  'options.lastOne': ['the last one', 'die letzte'],
  'options.removeAria': ['Remove {value}', '{value} entfernen'],
  'options.reset': ['Reset to defaults', 'Auf Standard zurücksetzen'],
  'options.wasReset': ['List reset', 'Liste zurückgesetzt'],
  'options.added': ['Added {value}', '{value} hinzugefügt'],
  'options.removed': ['Removed {value}', '{value} entfernt'],
  'options.duplicate': ['{value} is already in the list', '{value} steht schon in der Liste'],
  'options.full': ['That is as many as the list holds ({max})',
    'Mehr als {max} fasst die Liste nicht'],

  'options.rest.title': ['Rest timer values', 'Werte für den Pausentimer'],
  'options.rest.body': ['What the Rest timer dropdown offers. Anything from 5 seconds to an hour.',
    'Was der Pausentimer zur Auswahl stellt. Alles von 5 Sekunden bis zu einer Stunde.'],
  'options.rest.add': ['Add a value, in seconds', 'Wert hinzufügen, in Sekunden'],
  'options.rest.invalid': ['Enter a whole number of seconds between 5 and 3600.',
    'Gib eine ganze Sekundenzahl zwischen 5 und 3600 ein.'],
  'options.step.title': ['Weight step values', 'Werte für die Gewichtsschrittweite'],
  'options.step.body': ['What one tap of − or + moves a weight by. Match it to the smallest plate pair you own.',
    'Um wie viel ein Tipp auf − oder + das Gewicht verschiebt. Stell es auf dein kleinstes Scheibenpaar ein.'],
  'options.step.add': ['Add a value, in {unit}', 'Wert hinzufügen, in {unit}'],
  'options.step.invalid': ['Enter a weight between 0.25 and 100.',
    'Gib ein Gewicht zwischen 0,25 und 100 ein.'],
  'options.trend.title': ['Trend line lengths', 'Längen der Trendlinie'],
  'options.trend.body': ['How many sessions the moving average is taken over. Nothing is drawn until you have that many, so a long average on a short history draws nothing at all.',
    'Über wie viele Einheiten der gleitende Durchschnitt läuft. Vorher wird nichts gezeichnet — ein langer Durchschnitt auf kurzer Historie zeichnet also gar nichts.'],
  'options.trend.add': ['Add a length, in sessions', 'Länge hinzufügen, in Einheiten'],
  'options.trend.invalid': ['Enter a whole number of sessions between {min} and {max}.',
    'Gib eine ganze Zahl an Einheiten zwischen {min} und {max} ein.'],
  'options.trend.format': ['{n} sessions', '{n} Einheiten'],

  /* --------------------------------------------------------- settings */
  'settings.eyebrow': ['Settings', 'Einstellungen'],
  'settings.title': ['Preferences & data', 'Einstellungen & Daten'],
  'settings.sub': ['{sessions} sessions · {exercises} exercises · stored on this device only.',
    '{sessions} Einheiten · {exercises} Übungen · nur auf diesem Gerät gespeichert.'],
  'settings.exportNag': ['Export a backup.', 'Mach ein Backup.'],
  'settings.neverExported': ["You have never exported. iOS can clear a site's storage on its own — a file in your Files app is the only real safety net.",
    'Du hast noch nie exportiert. iOS kann den Speicher einer Seite von sich aus leeren — eine Datei in deiner Dateien-App ist das einzige echte Sicherheitsnetz.'],
  'settings.lastExportWas': ['Last export was {n} days ago.', 'Letzter Export vor {n} Tagen.'],
  'settings.lastExport.one': ['Last export {n} day ago.', 'Letzter Export vor {n} Tag.'],
  'settings.lastExport.other': ['Last export {n} days ago.', 'Letzter Export vor {n} Tagen.'],
  'settings.exportBackup': ['Export backup', 'Backup exportieren'],
  'settings.importBackup': ['Import backup', 'Backup importieren'],
  'settings.exportCsv': ['Export CSV', 'CSV exportieren'],
  'settings.importCsv': ['Import CSV', 'CSV importieren'],
  'settings.dataInfoAria': ['About export and import', 'Über Export und Import'],
  'settings.appearance': ['Appearance', 'Darstellung'],
  'settings.theme': ['Theme', 'Design'],
  'settings.themeNote': ['The {glyph} beside the wordmark flips it without coming here.',
    'Die {glyph} neben dem Schriftzug schaltet um, ohne hierher zu kommen.'],
  'settings.language': ['Language', 'Sprache'],
  'settings.languageNote': ['{code} beside the wordmark switches language from any screen. Dates and numbers follow it.',
    '{code} neben dem Schriftzug wechselt die Sprache von jedem Bildschirm aus. Datum und Zahlen folgen mit.'],
  'settings.textSize': ['Text size', 'Schriftgröße'],
  'settings.textSizeNote': ['Adds up to 4 px to everything smaller than the greeting on the Log — labels, numbers and captions gain the most.',
    'Legt bis zu 4 px auf alles, was kleiner ist als der Gruß im Training — Beschriftungen, Zahlen und Notizen gewinnen am meisten.'],
  'settings.preferences': ['Preferences', 'Einstellungen'],
  'settings.unit': ['Weight unit', 'Gewichtseinheit'],
  'settings.kg': ['Kilograms (kg)', 'Kilogramm (kg)'],
  'settings.lb': ['Pounds (lb)', 'Pfund (lb)'],
  'settings.weightStep': ['Weight step', 'Gewichtsschrittweite'],
  'settings.repStep': ['Rep step', 'Wiederholungsschritt'],
  'settings.restTimer': ['Rest timer', 'Pausentimer'],
  'settings.restAuto': ['Start rest timer automatically', 'Pausentimer automatisch starten'],
  'settings.restAutoYes': ['Yes, when I mark a set done', 'Ja, wenn ich einen Satz abhake'],
  'settings.restAutoNo': ['No, never', 'Nein, nie'],
  'settings.editListNote': ['Weight step and Rest timer end in “Edit this list…”, where you can add or remove the values they offer. So does Averaged over, below.',
    'Gewichtsschrittweite und Pausentimer enden mit „Diese Liste bearbeiten…“, wo du ihre Werte ergänzen oder entfernen kannst. Gemittelt über, weiter unten, ebenfalls.'],
  'settings.motivation': ['Motivation', 'Motivation'],
  'settings.boostMetric': ['Target to beat', 'Zu schlagender Wert'],
  'settings.plot': ['Plot settings', 'Diagramme'],
  'settings.trend': ['Volume trend line', 'Trendlinie fürs Volumen'],
  'settings.trendNote': ['Drawn over Volume per session in Progress → Per exercise.',
    'Wird über Volumen pro Einheit in Fortschritt → Pro Übung gezeichnet.'],
  'settings.trendPeriod': ['Averaged over', 'Gemittelt über'],
  'settings.emaNote': ['Each session weighted 2/({n}+1), seeded with the plain average of the first {n}.',
    'Jede Einheit mit 2/({n}+1) gewichtet, gestartet mit dem einfachen Mittel der ersten {n}.'],
  'settings.smaNote': ['The mean of every {n} consecutive sessions. Nothing is drawn until there are {n}.',
    'Das Mittel von je {n} aufeinanderfolgenden Einheiten. Vor {n} Einheiten wird nichts gezeichnet.'],
  'settings.routines': ['Routines', 'Routinen'],
  'settings.manageRoutines': ['Manage routines', 'Routinen verwalten'],
  'settings.exercises': ['Exercises', 'Übungen'],
  'settings.manageExercises': ['Manage exercise list', 'Übungsliste verwalten'],
  'settings.storage': ['Storage', 'Speicher'],
  'settings.persisted': ['Marked persistent — the browser will not evict this data casually.',
    'Als dauerhaft markiert — der Browser wirft diese Daten nicht einfach weg.'],
  'settings.notPersisted': ['Not marked persistent. Add to the Home Screen and keep exporting.',
    'Nicht als dauerhaft markiert. Leg die App auf den Home-Bildschirm und exportiere regelmäßig.'],
  'settings.storageUsed': ['{used} MB used', '{used} MB belegt'],
  'settings.storageOf': [' of {quota} MB available', ' von {quota} MB verfügbar'],
  'settings.app': ['App', 'App'],
  'settings.reloadApp': ['Reload app', 'App neu laden'],
  'settings.checkUpdate': ['Check for update', 'Nach Update suchen'],
  'settings.clearCache': ['Clear offline cache', 'Offline-Cache leeren'],
  'settings.appNote': ['Reload app reopens the page as it is right now. Check for update asks the server for a newer version; if one exists it installs quietly in the background and offers a “Reload” toast to switch to it. Clear offline cache throws away every stored copy of the app and fetches it again — for when the files moved but the version did not. None of the three touch your sessions.',
    'App neu laden öffnet die Seite so, wie sie gerade ist. Nach Update suchen fragt den Server nach einer neueren Fassung; gibt es eine, installiert sie sich still im Hintergrund und bietet einen „Neu laden“-Hinweis an. Offline-Cache leeren wirft jede gespeicherte Kopie der App weg und holt sie neu — für den Fall, dass sich die Dateien geändert haben, die Version aber nicht. Keines der drei rührt deine Einheiten an.'],
  'settings.removeDemo': ['Remove sample data', 'Beispieldaten entfernen'],
  'settings.erase': ['Erase all data', 'Alle Daten löschen'],
  'settings.prefSaved': ['Preference saved', 'Einstellung gespeichert'],

  'exercises.eyebrow': ['Exercises', 'Übungen'],
  'exercises.count': ['{n} in your list', '{n} in deiner Liste'],
  'exercises.sub': ['Tap one to rename it, change its group, or remove it.',
    'Tippe eine an, um sie umzubenennen, ihre Gruppe zu ändern oder sie zu entfernen.'],
  'exercises.sessShort': ['sess', 'Einh.'],
  'exercises.none': ['No exercises yet.', 'Noch keine Übungen.'],
  'exercises.editTitle': ['Edit exercise', 'Übung bearbeiten'],
  'exercises.name': ['Name', 'Name'],
  'exercises.group': ['Muscle group', 'Muskelgruppe'],
  'exercises.groupPlaceholder': ['Legs, Back, Push…', 'Beine, Rücken, Drücken…'],
  'exercises.loading': ['Loading', 'Belastung'],
  'exercises.weighted': ['Weighted', 'Mit Gewicht'],
  'exercises.bodyweightOption': ['Bodyweight — track reps only',
    'Körpergewicht — nur Wiederholungen zählen'],
  'exercises.delete': ['Delete exercise', 'Übung löschen'],
  'exercises.deleteTitle': ['Delete {name}?', '{name} löschen?'],
  'exercises.deleteBody': ['The exercise disappears from your list. Sets already logged in past sessions stay, but show as a removed exercise.',
    'Die Übung verschwindet aus deiner Liste. Bereits aufgezeichnete Sätze bleiben, erscheinen aber als gelöschte Übung.'],
  'exercises.saved': ['Exercise saved', 'Übung gespeichert'],
  'exercises.deleted': ['Exercise deleted', 'Übung gelöscht'],
  'exercises.gone': ['That exercise is no longer in your list',
    'Diese Übung steht nicht mehr in deiner Liste'],

  /* --------------------------------------------------------- routines */
  'routines.eyebrow': ['Routines', 'Routinen'],
  'routines.saved': ['{n} saved', '{n} gespeichert'],
  'routines.sub': ['An ordered list of exercises. Starting one opens a session with every set already laid out, prefilled from the last time you trained it.',
    'Eine geordnete Liste von Übungen. Startest du eine, öffnet sich eine Einheit mit allen Sätzen — vorbelegt mit dem letzten Mal, als du sie trainiert hast.'],
  'routines.new': ['+ New routine', '+ Neue Routine'],
  'routines.none': ['No routines yet', 'Noch keine Routinen'],
  'routines.noneBody': ['Build one here, or tap “Save as routine” at the bottom of any session to keep the exercises you just did.',
    'Bau hier eine, oder tippe unten in einer Einheit auf „Als Routine speichern“, um die eben gemachten Übungen zu behalten.'],
  'routine.eyebrow': ['Routine', 'Routine'],
  'routine.notFound': ['Routine not found', 'Routine nicht gefunden'],
  'routine.backToRoutines': ['Back to routines', 'Zurück zu den Routinen'],
  'routine.emptySummary': ['No exercises left in this routine',
    'In dieser Routine ist keine Übung mehr übrig'],
  'routine.skipped.one': ['{n} deleted exercise, skipped on start',
    '{n} gelöschte Übung, wird beim Start übersprungen'],
  'routine.skipped.other': ['{n} deleted exercises, skipped on start',
    '{n} gelöschte Übungen, werden beim Start übersprungen'],
  'routine.empty': ['Nothing in this routine yet.', 'Noch nichts in dieser Routine.'],
  'routine.addExercise': ['+ Add exercise', '+ Übung hinzufügen'],
  'routine.start': ['Start this routine', 'Diese Routine starten'],
  'routine.fewerSets': ['Fewer sets', 'Weniger Sätze'],
  'routine.moreSets': ['More sets', 'Mehr Sätze'],
  'routine.setsShort': ['sets', 'Sätze'],
  'routine.position': ['{sets} · position {i} of {total}',
    '{sets} · Position {i} von {total}'],
  'routine.moveUp': ['Move up', 'Nach oben'],
  'routine.moveDown': ['Move down', 'Nach unten'],
  'routine.removeItem': ['Remove from routine', 'Aus der Routine entfernen'],
  'routine.removeItemSub': ['The exercise itself is untouched', 'Die Übung selbst bleibt'],
  'routine.name': ['Routine name', 'Name der Routine'],
  'routine.namePlaceholder': ['Push A, Legs, Upper…', 'Drücken A, Beine, Oberkörper…'],
  'routine.newTitle': ['New routine', 'Neue Routine'],
  'routine.renameTitle': ['Rename routine', 'Routine umbenennen'],
  'routine.deleteTitle': ['Delete {name}?', '{name} löschen?'],
  'routine.deleteBody': ['The routine is removed. Sessions you already logged from it are untouched.',
    'Die Routine wird entfernt. Bereits daraus aufgezeichnete Einheiten bleiben unberührt.'],
  'routine.deleted': ['Routine deleted', 'Routine gelöscht'],
  'routine.saveTitle': ['Save as routine', 'Als Routine speichern'],
  'routine.saveBody': ['{exercises}, with the working sets you did today.',
    '{exercises}, mit den Arbeitssätzen von heute.'],
  'routine.savedToast': ['Saved routine {name}', 'Routine {name} gespeichert'],
  'routine.nothingToSave': ['Nothing to save — every exercise here has been deleted',
    'Nichts zu speichern — jede Übung hier wurde gelöscht'],
  'routine.allDeleted': ['Every exercise in that routine has been deleted',
    'Jede Übung dieser Routine wurde gelöscht'],
  'routine.alreadyOpen': ['Session already in progress', 'Es läuft schon eine Einheit'],
  'routine.alreadyOpenBody': ['Add the {exercises} from {name} to the session you have open?',
    '{exercises} aus {name} zur offenen Einheit hinzufügen?'],
  'routine.addToSession': ['Add to session', 'Zur Einheit hinzufügen'],
  'routine.startedToast': ['Started {name}', '{name} gestartet'],
  'routine.addedToast': ['Added {name}', '{name} hinzugefügt'],
  'routine.droppedSuffix': [' — {exercises} skipped', ' — {exercises} übersprungen'],

  /* --------------------------------------------------- export / import */
  'io.exportedSessions': ['Exported {n} sessions', '{n} Einheiten exportiert'],
  'io.exportedSets': ['Exported {n} sets', '{n} Sätze exportiert'],
  'io.noFile': ['No file chosen.', 'Keine Datei ausgewählt.'],
  'io.unreadable': ['That file could not be read.', 'Diese Datei konnte nicht gelesen werden.'],
  'io.importFailed': ['Import failed.', 'Import fehlgeschlagen.'],
  'io.mergeOrReplace': ['Merge or replace?', 'Zusammenführen oder ersetzen?'],
  'io.mergeOrReplaceBody': ['This backup holds {sessions}, {exercises}{routines}. Merge adds them to what is here and leaves your settings alone. Replace wipes this device first, settings included. Either way the file wins where the two hold the same session.',
    'Dieses Backup enthält {sessions}, {exercises}{routines}. Zusammenführen fügt sie zum Vorhandenen hinzu und lässt deine Einstellungen in Ruhe. Ersetzen löscht dieses Gerät zuerst, samt Einstellungen. So oder so gewinnt die Datei, wo beide dieselbe Einheit halten.'],
  'io.andRoutines': [' and {routines}', ' und {routines}'],
  'io.merge': ['Merge', 'Zusammenführen'],
  'io.mergeSub': ['Adds to what is here. Settings untouched, nothing deleted',
    'Ergänzt das Vorhandene. Einstellungen bleiben, nichts wird gelöscht'],
  'io.replace': ['Replace everything', 'Alles ersetzen'],
  'io.replaceSub': ['Wipes this device first, settings included',
    'Löscht zuerst dieses Gerät, samt Einstellungen'],
  'io.merged': ['Merged {n} sessions', '{n} Einheiten zusammengeführt'],
  'io.restored': ['Restored {n} sessions', '{n} Einheiten wiederhergestellt'],
  'io.imported': ['Imported {n} sessions', '{n} Einheiten importiert'],
  'io.unfamiliarCsv': ['Unfamiliar CSV', 'Unbekannte CSV'],
  'io.unfamiliarCsvBody': ['No Exercise Name or Routine Name header in this file. flexloop will read it in the usual column order anyway.',
    'Keine Spalte „Exercise Name“ oder „Routine Name“ in dieser Datei. flexloop liest sie trotzdem in der üblichen Spaltenreihenfolge.'],
  'io.tryAnyway': ['Try anyway', 'Trotzdem versuchen'],
  'io.importHistory': ['Import this history?', 'Diesen Verlauf importieren?'],
  'io.importHistoryBody': ['Found {sessions} across {exercises}{skipped}. These are merged in; nothing already on this device is deleted.',
    '{sessions} über {exercises} gefunden{skipped}. Sie werden zusammengeführt; nichts auf diesem Gerät wird gelöscht.'],
  'io.skippedRows': [', skipping {n} unreadable rows', ', {n} unlesbare Zeilen übersprungen'],
  'io.csvNoRows': ['That CSV had no rows in it.', 'Diese CSV enthielt keine Zeilen.'],
  'io.importedGroup': ['Imported', 'Importiert'],
  'io.unknownExercise': ['Unknown exercise', 'Unbekannte Übung'],

  'backup.notBackup': ['That file is not a flexloop backup.',
    'Diese Datei ist kein flexloop-Backup.'],
  'backup.noSchema': ['Missing schemaVersion — not a flexloop backup.',
    'schemaVersion fehlt — kein flexloop-Backup.'],
  'backup.tooNew': ['Backup is schema v{found}; this build reads up to v{max}. Update the app first.',
    'Backup hat Schema v{found}; diese Fassung liest bis v{max}. Aktualisiere zuerst die App.'],
  'backup.missingLists': ['Backup is missing its sessions or exercises list.',
    'Dem Backup fehlt die Liste der Einheiten oder der Übungen.'],
  'backup.badRoutines': ['Backup has a routines field that is not a list.',
    'Das Feld routines im Backup ist keine Liste.'],

  /* ------------------------------------------------------- sample data */
  'demo.loadTitle': ['Load sample data?', 'Beispieldaten laden?'],
  'demo.loadBody': ['{sessions} example sessions across six months, with {exercises} and {routines}. Your settings are untouched, and Settings can remove all of it again.',
    '{sessions} Beispiel-Einheiten über sechs Monate, mit {exercises} und {routines}. Deine Einstellungen bleiben unberührt, und die Einstellungen können alles wieder entfernen.'],
  'demo.loadConfirm': ['Load it', 'Laden'],
  'demo.loaded': ['Loaded {n} sample sessions', '{n} Beispiel-Einheiten geladen'],
  'demo.removeTitle': ['Remove sample data?', 'Beispieldaten entfernen?'],
  'demo.removeBody': ['Deletes the {n} sample sessions and their routines. Anything you logged yourself stays, along with any sample exercise you have since used.',
    'Löscht die {n} Beispiel-Einheiten und ihre Routinen. Alles selbst Aufgezeichnete bleibt, ebenso jede Beispielübung, die du seitdem benutzt hast.'],
  'demo.removed': ['Removed {n} sample sessions', '{n} Beispiel-Einheiten entfernt'],

  'demo.split.push': ['Push', 'Drücken'],
  'demo.split.pull': ['Pull', 'Ziehen'],
  'demo.split.legs': ['Legs', 'Beine'],
  'demo.ex.bench_press': ['Bench Press', 'Bankdrücken'],
  'demo.ex.overhead_press': ['Overhead Press', 'Schulterdrücken'],
  'demo.ex.incline_db_press': ['Incline Dumbbell Press', 'Schrägbankdrücken (KH)'],
  'demo.ex.cable_fly': ['Cable Fly', 'Kabelzug-Fliegende'],
  'demo.ex.triceps_pushdown': ['Triceps Pushdown', 'Trizepsdrücken am Kabel'],
  'demo.ex.deadlift': ['Deadlift', 'Kreuzheben'],
  'demo.ex.barbell_row': ['Barbell Row', 'Langhantelrudern'],
  'demo.ex.pull_up': ['Pull-Up', 'Klimmzug'],
  'demo.ex.face_pull': ['Face Pull', 'Face Pull'],
  'demo.ex.db_curl': ['Dumbbell Curl', 'Kurzhantel-Curl'],
  'demo.ex.back_squat': ['Back Squat', 'Kniebeuge'],
  'demo.ex.romanian_deadlift': ['Romanian Deadlift', 'Rumänisches Kreuzheben'],
  'demo.ex.leg_press': ['Leg Press', 'Beinpresse'],
  'demo.ex.leg_curl': ['Seated Leg Curl', 'Beinbeuger sitzend'],
  'demo.ex.calf_raise': ['Standing Calf Raise', 'Wadenheben stehend'],

  /* ---------------------------------------------------- danger / erase */
  'erase.title': ['Erase everything?', 'Alles löschen?'],
  'erase.body': ['Every session, exercise, routine and setting on this device is deleted. Export first if you might want any of it back.',
    'Jede Einheit, Übung, Routine und Einstellung auf diesem Gerät wird gelöscht. Exportiere vorher, falls du etwas davon zurückhaben willst.'],
  'erase.confirm': ['Erase everything', 'Alles löschen'],
  'erase.done': ['All data erased', 'Alle Daten gelöscht'],

  /* -------------------------------------------------------- app / cache */
  'sw.unsupported': ['Service worker not supported', 'Service Worker nicht unterstützt'],
  'sw.unregistered': ['Service worker not registered', 'Service Worker nicht registriert'],
  'sw.checkFailed': ['Could not check for updates', 'Suche nach Updates fehlgeschlagen'],
  'sw.upToDate': ['Already on the latest version ({version})',
    'Schon auf der neuesten Version ({version})'],
  'sw.updateReady': ['Update ready', 'Update bereit'],
  'cache.unsupported': ['Cache storage not supported', 'Cache-Speicher nicht unterstützt'],
  'cache.offline': ['Go online first — the app refetches itself',
    'Geh erst online — die App lädt sich selbst neu'],
  'cache.clearTitle': ['Clear the offline cache?', 'Offline-Cache leeren?'],
  'cache.clearBody': ['Every stored copy of the app is deleted and fetched again on the next load. Your sessions, exercises, routines and settings are not touched. Needs a connection.',
    'Jede gespeicherte Kopie der App wird gelöscht und beim nächsten Laden neu geholt. Deine Einheiten, Übungen, Routinen und Einstellungen bleiben unberührt. Braucht eine Verbindung.'],
  'cache.clearConfirm': ['Clear and reload', 'Leeren und neu laden'],
  'cache.clearFailed': ['Could not clear the cache', 'Cache konnte nicht geleert werden'],

  'boot.storageTitle': ['Storage unavailable', 'Speicher nicht verfügbar'],
  'boot.storageBody': ['This browser blocked local storage, so flexloop cannot save anything. Private browsing is the usual cause.',
    'Dieser Browser hat den lokalen Speicher blockiert, flexloop kann also nichts sichern. Meist liegt es am privaten Modus.'],

  'hint.a2hsTitle': ['Put flexloop on your Home Screen.',
    'Leg flexloop auf deinen Home-Bildschirm.'],
  'hint.a2hsBody': ['Tap Share, then “Add to Home Screen”. It then opens full screen and works with no signal.',
    'Tippe auf Teilen, dann „Zum Home-Bildschirm“. Danach öffnet sie im Vollbild und läuft ohne Empfang.'],

  /* --------------------------------------------------------- the menus */
  'setMenu.title': ['Set {n}', 'Satz {n}'],
  'setMenu.makeWorking': ['Make it a working set', 'Zum Arbeitssatz machen'],
  'setMenu.markWarmup': ['Mark as warmup', 'Als Aufwärmsatz markieren'],
  'setMenu.warmupSub': ['Warmups are excluded from volume and records',
    'Aufwärmsätze zählen nicht für Volumen und Bestleistungen'],
  'setMenu.duplicate': ['Duplicate set', 'Satz duplizieren'],
  'setMenu.duplicateSub': ['Same weight and reps, added below',
    'Gleiches Gewicht, gleiche Wiederholungen, darunter eingefügt'],
  'setMenu.delete': ['Delete set', 'Satz löschen'],
  'setMenu.deleteSub': ['Cannot be undone', 'Kann nicht rückgängig gemacht werden'],

  'entryMenu.sub': ['{sets} in this session', '{sets} in dieser Einheit'],
  'entryMenu.allDone': ['Mark every set done', 'Alle Sätze abhaken'],
  'entryMenu.allDoneSub': ['Tick the whole exercise at once',
    'Die ganze Übung auf einmal abhaken'],
  'entryMenu.remove': ['Remove from session', 'Aus der Einheit entfernen'],
  'entryMenu.removeSub': ['Deletes its sets here only', 'Löscht nur ihre Sätze hier'],

  /* -------------------------------------------------------- the debrief */
  'verdict.pr': ['best ever', 'Bestleistung'],
  'verdict.up': ['up on last time', 'besser als letztes Mal'],
  'verdict.level': ['level with last time', 'gleich wie letztes Mal'],
  'verdict.down': ['down on last time', 'schlechter als letztes Mal'],
  'verdict.first': ['first time logged', 'zum ersten Mal aufgezeichnet'],

  /* ---------------------------------------------------------- the info */
  'info.log.title': ['the Log', 'das Training'],
  'info.log.sub': ['The +/− steppers and the checkmark cover adding and finishing a set. Everything else lives behind a long-press.',
    'Die +/−-Schalter und das Häkchen decken Hinzufügen und Abschließen eines Satzes ab. Alles andere liegt hinter einem langen Druck.'],
  'info.history.title': ['History', 'den Verlauf'],
  'info.history.sub': ['Every finished session, newest first, grouped by month with that month’s session count and total volume.',
    'Jede beendete Einheit, die neueste zuerst, nach Monat gruppiert mit der Zahl der Einheiten und dem Gesamtvolumen des Monats.'],
  'info.progress.title': ['Progress', 'den Fortschritt'],
  'info.progress.sub': ['Overview is your whole training week by week. Per exercise is one lift at a time, over the window you pick.',
    'Überblick zeigt dein ganzes Training Woche für Woche. Pro Übung zeigt eine Übung nach der anderen, über den gewählten Zeitraum.'],
  'info.settings.title': ['Settings', 'die Einstellungen'],
  'info.settings.sub': ['Preferences, the three editable dropdowns, what the Log aims at, how the trend line is computed, and your backups.',
    'Einstellungen, die drei bearbeitbaren Listen, worauf das Training zielt, wie die Trendlinie gerechnet wird, und deine Backups.'],

  'version.title': ['Version history', 'Versionsverlauf'],
  'version.sub': ['You are on {version}. The version names the offline cache, so it changes whenever the app itself does.',
    'Du bist auf {version}. Die Version benennt den Offline-Cache und ändert sich daher, sobald sich die App ändert.'],

  'dataInfo.title': ['About export and import', 'Über Export und Import'],
  'dataInfo.sub': ['What each file carries, and what it leaves behind.',
    'Was jede Datei mitnimmt und was sie zurücklässt.'],

  /* --------------------------------------------------------- the charts */
  'chart.line': ['Line chart', 'Liniendiagramm'],
  'chart.bar': ['Bar chart', 'Balkendiagramm'],
  'chart.sets': ['Weight and reps per set', 'Gewicht und Wiederholungen pro Satz'],
  'chart.emptyLine': ['No sessions in this window yet. Log one and the line starts here.',
    'Noch keine Einheiten in diesem Zeitraum. Zeichne eine auf, dann beginnt hier die Linie.'],
  'chart.empty': ['Nothing to chart yet.', 'Noch nichts zu zeichnen.'],
};

/* =========================================================================
   LISTS.  Anything the UI renders as a run of items.
   ========================================================================= */

const LISTS = {
  /* Stands in for the date on the idle Log — see MOTIVATIONS in app.js. */
  'log.motivations': {
    en: [
      "Let's go!",
      'Time to lift.',
      'Show up again.',
      'Make it count.',
      'One more rep.',
      'No zero days.',
      'Beat last time.',
      'Earn the rest.',
      'Strong starts now.',
      'Nobody lifts it for you.',
    ],
    de: [
      'Los geht’s!',
      'Zeit zu heben.',
      'Sei wieder da.',
      'Mach was draus.',
      'Eine Wiederholung mehr.',
      'Keine Nulltage.',
      'Schlag das letzte Mal.',
      'Verdien dir die Pause.',
      'Stark wird jetzt.',
      'Keiner hebt es für dich.',
    ],
  },

  'info.log.items': {
    en: [
      ['Long-press a set row',
        "Opens a menu to mark it a warmup, duplicate it, or delete it. There's no swipe or edit button — deleting a set is always this."],
      ['Tap the weight or reps number',
        'Type a value directly instead of stepping to it. One tap of − or + moves it by the weight step and rep step set in Settings.'],
      ['Tap ••• on an exercise card',
        'Mark every set in it done at once, move it up or down, or remove it from this session — the exercise itself is untouched.'],
      ["Tap an exercise's name",
        'Jumps to its chart on Progress → Per exercise.'],
      ['The dim line under each name',
        'The ghost: what you lifted last time, so you never have to go looking for it. New sets prefill from it too.'],
      ['The line under the ghost',
        'The target: what it would take to beat your own number today, in whichever metric you picked in Settings → Motivation. It aims at last session while you are under it, then at your all-time best. Tick the set that clears it and it says so.'],
    ],
    de: [
      ['Lange auf eine Satzzeile drücken',
        'Öffnet ein Menü: als Aufwärmsatz markieren, duplizieren oder löschen. Es gibt kein Wischen und keinen Bearbeiten-Knopf — einen Satz löschst du immer so.'],
      ['Auf die Gewichts- oder Wiederholungszahl tippen',
        'Tippe den Wert direkt ein, statt ihn zu erschrittweisen. Ein Tipp auf − oder + verschiebt ihn um die in den Einstellungen gesetzte Schrittweite.'],
      ['Auf ••• einer Übungskarte tippen',
        'Alle Sätze auf einmal abhaken, die Übung nach oben oder unten schieben oder aus dieser Einheit entfernen — die Übung selbst bleibt.'],
      ['Auf den Namen einer Übung tippen',
        'Springt zu ihrem Diagramm unter Fortschritt → Pro Übung.'],
      ['Die blasse Zeile unter jedem Namen',
        'Der Schatten: was du letztes Mal gehoben hast, damit du nie danach suchen musst. Neue Sätze werden daraus vorbelegt.'],
      ['Die Zeile unter dem Schatten',
        'Das Ziel: was es bräuchte, um heute deinen eigenen Wert zu schlagen — in der Größe, die du unter Einstellungen → Motivation gewählt hast. Solange du darunter liegst, zielt es auf die letzte Einheit, danach auf deine Bestleistung. Hak den Satz ab, der es knackt, und es sagt es dir.'],
    ],
  },

  'info.history.items': {
    en: [
      ['Tap any session',
        'Opens it for editing. Sets, notes and exercises can be changed long after the fact, and every chart follows.'],
      ['Deleting a session',
        'Is done from inside it, at the bottom. It disappears from history, from your records, and from every chart.'],
      ['Imported sessions',
        'Carry an “imported” mark at the top. A CSV becomes one session per calendar day, with the routine name kept as the note. Sample sessions are marked too.'],
      ['Volume, per month',
        'Σ weight × reps over completed working sets. Warmups never count.'],
    ],
    de: [
      ['Auf eine Einheit tippen',
        'Öffnet sie zum Bearbeiten. Sätze, Notizen und Übungen lassen sich noch lange danach ändern, und jedes Diagramm zieht mit.'],
      ['Eine Einheit löschen',
        'Geschieht in ihr selbst, ganz unten. Sie verschwindet aus dem Verlauf, aus deinen Bestleistungen und aus jedem Diagramm.'],
      ['Importierte Einheiten',
        'Tragen oben die Marke „importiert“. Eine CSV wird zu einer Einheit je Kalendertag, der Routinenname bleibt als Notiz. Beispiel-Einheiten sind ebenfalls markiert.'],
      ['Volumen pro Monat',
        'Σ Gewicht × Wdh. über erledigte Arbeitssätze. Aufwärmsätze zählen nie.'],
    ],
  },

  'info.progress.items': {
    en: [
      ['Estimated 1RM',
        'Epley: weight × (1 + reps / 30), taking the best set of each session. An estimate, and optimistic above about 12 reps — which is why the formula is printed on the chart.'],
      ['Volume',
        'Σ weight × reps across completed sets. Warmups are excluded everywhere, including from personal records.'],
      ['The trend line over Volume per session',
        'A moving average — simple or exponential, over as many sessions as you choose in Settings → Plot settings. It reads NEEDS n+ until there are that many sessions.'],
      ['↑ ↓ → in a volume reading',
        'Where the trend line moved between the session before and this one: climbing, falling, or level.'],
      ['Tap a point or a bar',
        'Reads out its value. The charts of one exercise share a selection, so tapping a session marks it in all of them — the chart you touched reads out brightest, the others faintly.'],
      ['1M / 3M / 6M / 1Y / All',
        'Cuts the window. Averages and records are computed over the whole history first, so the window moves the view, not the numbers.'],
      ['Going stale',
        'Longest since you last trained it. Past three weeks it turns red.'],
      ['Next target',
        'What it would take to beat your all-time best in the metric picked in Settings → Motivation, how long that best has stood, and whether the last few sessions are climbing.'],
    ],
    de: [
      ['Geschätztes 1RM',
        'Epley: Gewicht × (1 + Wdh. / 30), auf dem besten Satz jeder Einheit. Eine Schätzung, und oberhalb von etwa 12 Wiederholungen zu optimistisch — deshalb steht die Formel auf dem Diagramm.'],
      ['Volumen',
        'Σ Gewicht × Wdh. über erledigte Sätze. Aufwärmsätze bleiben überall außen vor, auch bei den Bestleistungen.'],
      ['Die Trendlinie über Volumen pro Einheit',
        'Ein gleitender Durchschnitt — einfach oder exponentiell, über so viele Einheiten, wie du unter Einstellungen → Diagramme wählst. Bis es so viele Einheiten gibt, steht dort BRAUCHT n+.'],
      ['↑ ↓ → in einer Volumenanzeige',
        'Wohin sich die Trendlinie zwischen der vorigen und dieser Einheit bewegt hat: steigend, fallend oder gleich.'],
      ['Auf einen Punkt oder Balken tippen',
        'Liest seinen Wert vor. Die Diagramme einer Übung teilen sich die Auswahl: Tippst du eine Einheit an, ist sie in allen markiert — das berührte Diagramm am hellsten, die anderen blass.'],
      ['1M / 3M / 6M / 1J / Alle',
        'Schneidet den Zeitraum zu. Durchschnitte und Bestleistungen werden zuerst über die ganze Historie gerechnet, der Zeitraum bewegt also die Ansicht, nicht die Zahlen.'],
      ['Länger nicht trainiert',
        'Am längsten her, seit du es zuletzt trainiert hast. Nach drei Wochen wird es rot.'],
      ['Nächstes Ziel',
        'Was es bräuchte, um deine Bestleistung in der unter Einstellungen → Motivation gewählten Größe zu schlagen, wie lange diese Bestleistung schon steht, und ob die letzten Einheiten steigen.'],
    ],
  },

  'info.settings.items': {
    en: [
      ['Editable dropdowns',
        'Rest timer, Weight step and Averaged over end in “Edit this list…”. That opens an editor where you add a value of your own — 75 seconds, a 3.75 kg plate pair, a 6-session average — or remove ones you never pick. Remove the value in use and the setting moves to the nearest one left; Reset to defaults puts the original list back.'],
      ['Weight step and rep step',
        'What one tap of − or + moves a set by while logging. The weight step follows the unit, so switching kg → lb relabels the list rather than converting it.'],
      ['Moving averages',
        'Simple averages the last n sessions equally. Exponential weights recent sessions more heavily, with k = 2/(n+1), and is seeded with the simple average of its first window — so both kinds start at the same session and the same number. Nothing is drawn until n sessions exist, and the average always runs over the full history before being cut to the window on screen.'],
      ['Export, regularly',
        'This app has no server. Everything lives in this browser’s storage, and iOS clears the storage of sites it considers unused — roughly a week of not opening one. The exported .json is the only real backup, so keep a recent one in your Files app or iCloud. flexloop nags after {days} days.'],
      ['Import',
        'Import backup asks whether to merge or replace: merge keeps what is already here and leaves your settings alone, replace wipes the device first. Import CSV always merges, deleting nothing. The ⓘ beside those buttons has the detail on both, and on what each file carries.'],
      ['Sample data',
        'With no history logged, the Log offers Load sample data: six months of an example split, so the charts and records have something to show. It never touches your settings, and Remove sample data here takes all of it back out, leaving anything you logged yourself — including any sample exercise you have since used.'],
      ['Target to beat',
        'Which metric the Log’s target line, the Next target tile and the finish-session read-out all measure. Estimated 1RM responds to weight and reps both; Heaviest set and Reps are blunter; Volume is the easiest to beat, since another set does it. None turns all three off. A lift that has never carried a load is always measured in reps.'],
      ['Theme, language and text size',
        'Dark, light, or match system; English or German. The sun/moon and the two-letter language chip beside the wordmark both flip from any screen, and the language carries the date and number formats with it. Text size adds 1 to 4 px to everything below the greeting on the Log — the small mono labels gain the most, since they had the least.'],
      ['Reload app, Check for update, Clear offline cache',
        'Installed on the Home Screen there is no address bar, so Reload app is the way to reopen the page as it stands. Check for update asks the server whether a newer version exists — the browser only looks on its own schedule otherwise — and a new one installs in the background behind a Reload toast, so it never lands mid-set. Clear offline cache is the blunt one: it deletes every stored copy of the app so the next load fetches all of it again, which is what to reach for when a release was redeployed under a version number that did not change. It needs a connection, and none of the three touch your data.'],
      ['The version at the foot',
        'Tap it for the version history — what changed in each release. The offline cache is named after it ({version}), so it changes whenever the app itself does.'],
    ],
    de: [
      ['Bearbeitbare Auswahllisten',
        'Pausentimer, Gewichtsschrittweite und Gemittelt über enden mit „Diese Liste bearbeiten…“. Das öffnet einen Editor, in dem du eigene Werte ergänzt — 75 Sekunden, ein 3,75-kg-Scheibenpaar, ein Durchschnitt über 6 Einheiten — oder nie genutzte entfernst. Entfernst du den benutzten Wert, rückt die Einstellung auf den nächstgelegenen; Auf Standard zurücksetzen holt die ursprüngliche Liste zurück.'],
      ['Gewichts- und Wiederholungsschritt',
        'Um wie viel ein Tipp auf − oder + einen Satz beim Aufzeichnen verschiebt. Die Gewichtsschrittweite folgt der Einheit: kg → lb beschriftet die Liste neu, statt sie umzurechnen.'],
      ['Gleitende Durchschnitte',
        'Einfach mittelt die letzten n Einheiten gleich stark. Exponentiell gewichtet neuere Einheiten stärker, mit k = 2/(n+1), und startet mit dem einfachen Mittel des ersten Fensters — beide beginnen also bei derselben Einheit und derselben Zahl. Vor n Einheiten wird nichts gezeichnet, und der Durchschnitt läuft immer über die ganze Historie, bevor er auf den sichtbaren Zeitraum zugeschnitten wird.'],
      ['Regelmäßig exportieren',
        'Diese App hat keinen Server. Alles liegt im Speicher dieses Browsers, und iOS leert den Speicher von Seiten, die es für ungenutzt hält — etwa eine Woche ohne Öffnen. Die exportierte .json ist das einzige echte Backup; halte eine aktuelle in deiner Dateien-App oder in iCloud. flexloop erinnert nach {days} Tagen.'],
      ['Importieren',
        'Backup importieren fragt, ob zusammengeführt oder ersetzt werden soll: Zusammenführen behält das Vorhandene und lässt deine Einstellungen in Ruhe, Ersetzen löscht zuerst das Gerät. CSV importieren führt immer zusammen und löscht nichts. Das ⓘ neben diesen Knöpfen erklärt beides im Detail und sagt, was jede Datei mitnimmt.'],
      ['Beispieldaten',
        'Ohne aufgezeichnete Historie bietet das Training Beispieldaten laden an: sechs Monate eines Beispielsplits, damit Diagramme und Bestleistungen etwas zu zeigen haben. Deine Einstellungen bleiben unangetastet, und Beispieldaten entfernen nimmt hier alles wieder heraus — bis auf das, was du selbst aufgezeichnet hast, samt jeder Beispielübung, die du seitdem benutzt hast.'],
      ['Zu schlagender Wert',
        'Welche Größe die Zielzeile im Training, die Kachel Nächstes Ziel und die Auswertung am Ende einer Einheit messen. Geschätztes 1RM reagiert auf Gewicht und Wiederholungen; Schwerster Satz und Wdh. sind gröber; Volumen ist am leichtesten zu schlagen, ein weiterer Satz genügt. Keiner schaltet alle drei ab. Eine Übung, die nie eine Last getragen hat, wird immer in Wiederholungen gemessen.'],
      ['Design, Sprache und Schriftgröße',
        'Dunkel, hell oder wie das System; Englisch oder Deutsch. Sonne/Mond und das zweibuchstabige Sprachkürzel neben dem Schriftzug schalten von jedem Bildschirm aus um, und die Sprache nimmt Datums- und Zahlenformat mit. Schriftgröße legt 1 bis 4 px auf alles unterhalb des Grußes im Training — die kleinen Mono-Beschriftungen gewinnen am meisten, weil sie am wenigsten hatten.'],
      ['App neu laden, Nach Update suchen, Offline-Cache leeren',
        'Auf dem Home-Bildschirm installiert gibt es keine Adressleiste, App neu laden ist also der Weg, die Seite neu zu öffnen. Nach Update suchen fragt den Server, ob es eine neuere Fassung gibt — sonst schaut der Browser nur nach eigenem Zeitplan — und eine neue installiert sich im Hintergrund hinter einem Neu-laden-Hinweis, damit sie nie mitten im Satz landet. Offline-Cache leeren ist das grobe Mittel: Es löscht jede gespeicherte Kopie der App, sodass der nächste Start alles neu holt — richtig, wenn eine Fassung unter unveränderter Versionsnummer neu veröffentlicht wurde. Es braucht eine Verbindung, und keines der drei rührt deine Daten an.'],
      ['Die Version ganz unten',
        'Tippe sie an für den Versionsverlauf — was sich in jeder Fassung geändert hat. Der Offline-Cache ist nach ihr benannt ({version}) und ändert sich daher, sobald sich die App ändert.'],
    ],
  },

  'dataInfo.items': {
    en: [
      ['Export backup — .json',
        'Everything, exactly as stored: sessions, exercises, routines and your settings. This is the lossless one and the only real backup — which is why only this button counts towards the export reminder, and a CSV never does.'],
      ['Import backup — merge or replace',
        'Merge adds the file’s sessions, exercises and routines to what is already here and leaves your settings alone. Replace wipes this device first, settings included. Both match on id, so where the two hold the same session the file wins outright — it is not a line-by-line merge of the two versions.'],
      ['Reading a backup elsewhere',
        'It is plain JSON, so any text editor opens it. schemaVersion says which shape it is in; flexloop refuses a file written by a newer version of the app rather than guess at it.'],
      ['CSV — one row per set',
        'Plain text, opens in any spreadsheet. Columns: App Version, Routine Name, Exercise Name, Exercise Type, Weight, Rep, Duration, Date. The date carries a time, which is what keeps sets in order.'],
      ['Import CSV',
        'Reads that shape and always merges — nothing already here is deleted. Sets sharing a calendar day become one session. (Import CSV from for example Strongify.)'],
      ['Export CSV',
        'Writes the same file, working sets only. Routines, settings, RPE, warmup flags and unfinished sets have no column and do not survive the trip. Use the .json to move between devices; use the CSV to take your history somewhere else.'],
    ],
    de: [
      ['Backup exportieren — .json',
        'Alles, genau wie gespeichert: Einheiten, Übungen, Routinen und deine Einstellungen. Das ist die verlustfreie Datei und das einzige echte Backup — deshalb zählt nur dieser Knopf für die Export-Erinnerung, eine CSV nie.'],
      ['Backup importieren — zusammenführen oder ersetzen',
        'Zusammenführen fügt Einheiten, Übungen und Routinen der Datei zum Vorhandenen hinzu und lässt deine Einstellungen in Ruhe. Ersetzen löscht zuerst dieses Gerät, samt Einstellungen. Beide gleichen über die id ab: Wo beide dieselbe Einheit halten, gewinnt die Datei vollständig — es ist keine zeilenweise Verschmelzung.'],
      ['Ein Backup anderswo lesen',
        'Es ist reines JSON, jeder Texteditor öffnet es. schemaVersion sagt, in welcher Form es vorliegt; flexloop verweigert eine Datei aus einer neueren Fassung der App, statt zu raten.'],
      ['CSV — eine Zeile pro Satz',
        'Reiner Text, öffnet in jeder Tabellenkalkulation. Spalten: App Version, Routine Name, Exercise Name, Exercise Type, Weight, Rep, Duration, Date. Das Datum trägt eine Uhrzeit, die die Sätze in Reihenfolge hält.'],
      ['CSV importieren',
        'Liest diese Form und führt immer zusammen — nichts Vorhandenes wird gelöscht. Sätze desselben Kalendertags werden zu einer Einheit. (CSV-Import zum Beispiel aus Strongify.)'],
      ['CSV exportieren',
        'Schreibt dieselbe Datei, nur Arbeitssätze. Routinen, Einstellungen, RPE, Aufwärm-Markierungen und unfertige Sätze haben keine Spalte und überleben die Reise nicht. Nimm die .json, um zwischen Geräten umzuziehen; nimm die CSV, um deine Historie woandershin mitzunehmen.'],
    ],
  },
};
