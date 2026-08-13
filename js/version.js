/* =========================================================================
   version.js — the build version, and what changed in each one.

   TO SHIP AN UPDATE: bump APP_VERSION and add an entry at the top of
   CHANGELOG. Nothing else. The service worker names its cache after this
   string, so bumping it is what drops the old cache and refetches the shell.

   This file is loaded twice and in two different ways:
     · sw.js pulls it in with importScripts(), which cannot parse a module,
     · app.js imports it as a module, for the Settings footer and the
       version-history sheet.
   Hence the assignments to `self` and the absence of any `export`: that is
   the one shape both loaders understand.

   Each entry carries both languages — { en: [title, body], de: [title,
   body] } — rather than reaching into i18n.js, which is a module this file
   cannot import. app.js falls back to `en` for anything a translation has
   not reached.

   Keep every changelog line to about 30 words, in each language. It is a
   reminder of what moved, not a commit message — and the sheet is read on a
   phone.
   ========================================================================= */

self.APP_VERSION = 'flexloop-v26';

/* Newest first. `v` is the cache name that shipped the entries under it. */
self.APP_CHANGELOG = [
  {
    v: 'flexloop-v26',
    items: [
      {
        en: ['German, and a language toggle',
          'A two-letter chip beside the sun/moon switches the whole interface between English and German, from any screen. Settings → Appearance holds the same choice.'],
        de: ['Deutsch, und ein Sprachschalter',
          'Ein Kürzel aus zwei Buchstaben neben Sonne/Mond schaltet die ganze Oberfläche zwischen Englisch und Deutsch um, von jedem Bildschirm aus. Einstellungen → Darstellung hat dieselbe Wahl.'],
      },
      {
        en: ['Dates and numbers follow the language',
          'German prints “20. Juli” and a decimal comma, English “20 Jul” and a decimal point. Neither follows the handset any more — the app decides.'],
        de: ['Datum und Zahlen folgen der Sprache',
          'Deutsch schreibt „20. Juli“ und Dezimalkomma, Englisch „20 Jul“ und Dezimalpunkt. Keins folgt mehr dem Handy — die App entscheidet.'],
      },
      {
        en: ['Sample data speaks it too',
          'Load sample data writes its exercises and routines in the language on screen. Every id stays the same, so removing it later still finds all of it.'],
        de: ['Beispieldaten sprechen mit',
          'Beispieldaten laden schreibt Übungen und Routinen in der Sprache auf dem Bildschirm. Jede id bleibt gleich, das Entfernen findet später also weiterhin alles.'],
      },
    ],
  },
  {
    v: 'flexloop-v25',
    items: [
      {
        en: ['The wordmark opens the project',
          'Tapping “flexloop” in the topbar opens the project page in a new tab. Nothing else in the header moved.'],
        de: ['Der Schriftzug öffnet das Projekt',
          'Ein Tipp auf „flexloop“ in der Kopfzeile öffnet die Projektseite in einem neuen Tab. Sonst hat sich oben nichts bewegt.'],
      },
      {
        en: ['Reload app, and Check for update',
          'Settings → App reopens the page — useful on the Home Screen, where there is no address bar — or asks the server for a newer version rather than waiting for the browser to look.'],
        de: ['App neu laden und Nach Update suchen',
          'Einstellungen → App öffnet die Seite neu — nützlich auf dem Home-Bildschirm, wo es keine Adressleiste gibt — oder fragt den Server nach einer neueren Fassung, statt auf den Browser zu warten.'],
      },
      {
        en: ['Clear offline cache',
          'Beneath those two, for when a release was redeployed without the version changing: it drops every stored copy of the app and fetches it again. Your data stays.'],
        de: ['Offline-Cache leeren',
          'Darunter, für den Fall einer erneut veröffentlichten Fassung ohne neue Versionsnummer: Es wirft jede gespeicherte Kopie der App weg und holt sie neu. Deine Daten bleiben.'],
      },
    ],
  },
  {
    v: 'flexloop-v24',
    items: [
      {
        en: ['No more empty session from a dismissed picker',
          'Start session used to write the session before you had picked anything. Dismiss the exercise picker any way and it sat there in progress, empty, hiding the routine list. It now waits for a pick.'],
        de: ['Keine leere Einheit mehr nach abgebrochener Auswahl',
          'Einheit starten schrieb die Einheit, bevor du etwas ausgewählt hattest. Brachst du die Übungsauswahl ab, blieb sie leer und laufend stehen und verdeckte die Routinenliste. Jetzt wartet sie auf eine Auswahl.'],
      },
      {
        en: ['A friendlier Start session',
          'The idle Log opens on one of ten short lines instead of the date, and the button says what it does: pick exercises manually.'],
        de: ['Ein freundlicheres Einheit starten',
          'Das ruhende Training öffnet mit einer von zehn kurzen Zeilen statt mit dem Datum, und der Knopf sagt, was er tut: Übungen selbst auswählen.'],
      },
      {
        en: ['Routines carry the accent',
          '“Start from a routine” is tinted the same colour as Start session, so the two ways into a session read as one choice.'],
        de: ['Routinen tragen die Akzentfarbe',
          '„Mit einer Routine starten“ ist so eingefärbt wie Einheit starten, damit die zwei Wege in eine Einheit als eine Wahl zu lesen sind.'],
      },
    ],
  },
  {
    v: 'flexloop-v23',
    items: [
      {
        en: ['Sample data, for an empty app',
          'With nothing logged, the Log offers six months of an example split so the charts and records have something to show. Settings removes it again, keeping anything you logged.'],
        de: ['Beispieldaten für eine leere App',
          'Ohne Aufzeichnungen bietet das Training sechs Monate eines Beispielsplits an, damit Diagramme und Bestleistungen etwas zeigen können. Die Einstellungen entfernen ihn wieder und behalten alles Selbstaufgezeichnete.'],
      },
      {
        en: ['Import asks: merge or replace',
          'Restoring a backup no longer always wipes the device. Merge adds the file to what is here and leaves your settings alone; Replace is the old behaviour.'],
        de: ['Import fragt: zusammenführen oder ersetzen',
          'Ein Backup einzuspielen löscht nicht mehr immer das Gerät. Zusammenführen fügt die Datei zum Vorhandenen und lässt die Einstellungen in Ruhe; Ersetzen ist das alte Verhalten.'],
      },
      {
        en: ['Export CSV',
          'History leaves as a spreadsheet as well as a backup, in the same columns Import CSV reads. Working sets only — the .json is still the complete copy.'],
        de: ['CSV exportieren',
          'Der Verlauf geht auch als Tabelle hinaus, in denselben Spalten, die CSV importieren liest. Nur Arbeitssätze — die .json bleibt die vollständige Kopie.'],
      },
      {
        en: ['An ⓘ for your data',
          'Beside the export and import buttons, explaining what each of the two files carries and what it drops. The CSV no longer names another app on the button itself.'],
        de: ['Ein ⓘ für deine Daten',
          'Neben den Export- und Import-Knöpfen, mit der Erklärung, was jede der beiden Dateien mitnimmt und was sie fallen lässt. Die CSV nennt keine andere App mehr auf dem Knopf selbst.'],
      },
    ],
  },
  {
    v: 'flexloop-v22',
    items: [
      {
        en: ['A shorter tab bar in dark mode',
          'Dark mode asked iOS for the strip behind the home indicator, then padded it back out. It no longer asks: 69px of bar down to 53px, for an opaque status bar.'],
        de: ['Eine kürzere Tab-Leiste im dunklen Design',
          'Das dunkle Design verlangte von iOS den Streifen hinter dem Home-Indikator und polsterte ihn dann wieder aus. Es verlangt ihn nicht mehr: 69 px Leiste auf 53 px, im Tausch gegen eine undurchsichtige Statusleiste.'],
      },
    ],
  },
  {
    v: 'flexloop-v21',
    items: [
      {
        en: ['Sheets stop a quarter down the screen',
          'A long one used to reach the status bar, leaving nowhere to tap to get out. There is always a quarter of backdrop above it now.'],
        de: ['Blätter enden ein Viertel unter dem oberen Rand',
          'Ein langes reichte bis zur Statusleiste und ließ keine Stelle zum Heraustippen. Jetzt bleibt immer ein Viertel Hintergrund darüber.'],
      },
      {
        en: ['The grab handle works',
          'Drag it down to throw the sheet away, or tap it. It has looked draggable since the first version and did nothing at all until now.'],
        de: ['Der Griff funktioniert',
          'Zieh ihn nach unten, um das Blatt wegzuwerfen, oder tippe ihn an. Er sah seit der ersten Fassung ziehbar aus und tat bis jetzt gar nichts.'],
      },
    ],
  },
  {
    v: 'flexloop-v20',
    items: [
      {
        en: ['Room above the home indicator',
          'The tab labels ended about 4px short of the indicator, near enough to touch it. They now clear it by about 15px, which costs the bar 12px of height.'],
        de: ['Platz über dem Home-Indikator',
          'Die Tab-Beschriftungen endeten etwa 4 px vor dem Indikator, nah genug, um ihn zu berühren. Jetzt halten sie etwa 15 px Abstand, was die Leiste 12 px Höhe kostet.'],
      },
    ],
  },
  {
    v: 'flexloop-v19',
    items: [
      {
        en: ['The tab bar setting is gone again',
          'Comfortable and Compact came in to work around the short viewport. That turned out to be the Home Screen icon, so the choice was solving nothing. Appearance is back to Theme alone.'],
        de: ['Die Einstellung zur Tab-Leiste ist wieder weg',
          'Komfortabel und Kompakt kamen, um den zu kurzen Viewport zu umgehen. Der lag am Home-Bildschirm-Symbol, die Wahl löste also nichts. Darstellung besteht wieder nur aus Design.'],
      },
    ],
  },
  {
    v: 'flexloop-v18',
    items: [
      {
        en: ['The band under the tab bar was the icon',
          'The old Home Screen icon launched the app 59px shorter than the screen. Deleting it and adding it again fixed it. No code was at fault, so none changed.'],
        de: ['Der Streifen unter der Tab-Leiste war das Symbol',
          'Das alte Home-Bildschirm-Symbol startete die App 59 px kürzer als den Bildschirm. Löschen und neu anlegen behob es. Kein Code war schuld, also änderte sich keiner.'],
      },
      {
        en: ['The Display readout is gone',
          'It did its job: it showed the app ended 59px above the bottom of the screen, which no tab bar could explain. Settings is back to normal.'],
        de: ['Die Anzeige-Auslese ist weg',
          'Sie hat ihre Arbeit getan: Sie zeigte, dass die App 59 px über dem unteren Bildschirmrand endete, was keine Tab-Leiste erklären konnte. Die Einstellungen sind wieder normal.'],
      },
    ],
  },
  {
    v: 'flexloop-v17',
    items: [
      {
        en: ['A Compact tab bar',
          'Settings → Appearance → Tab bar. Compact trims the row, its icons and the strip beneath them: 57px down to 47px on the Home Screen.'],
        de: ['Eine kompakte Tab-Leiste',
          'Einstellungen → Darstellung → Tab-Leiste. Kompakt kürzt die Reihe, ihre Symbole und den Streifen darunter: 57 px auf 47 px auf dem Home-Bildschirm.'],
      },
      {
        en: ['A Display readout, for now',
          'Settings prints what the screen reports, and can draw a line on the edge of the app. It is here to find the black band under the tab bar, then it goes.'],
        de: ['Eine Anzeige-Auslese, vorerst',
          'Die Einstellungen drucken, was der Bildschirm meldet, und können eine Linie an den Rand der App zeichnen. Sie ist da, um den schwarzen Streifen unter der Tab-Leiste zu finden, dann geht sie.'],
      },
    ],
  },
  {
    v: 'flexloop-v16',
    items: [
      {
        en: ['A shorter tab bar, properly this time',
          'v15 meant to let the home indicator pay for part of the row, but a 44px floor swallowed it. The row now overlaps the strip: 79px down to 57px.'],
        de: ['Eine kürzere Tab-Leiste, diesmal richtig',
          'v15 wollte den Home-Indikator einen Teil der Reihe zahlen lassen, aber eine Untergrenze von 44 px schluckte ihn. Die Reihe überlappt den Streifen jetzt: 79 px auf 57 px.'],
      },
    ],
  },
  {
    v: 'flexloop-v15',
    items: [
      {
        en: ['A shorter tab bar on the Home Screen',
          'Installed, the tab bar stacked its full height on top of the home indicator. The indicator now pays for part of it — about 14px of screen back.'],
        de: ['Eine kürzere Tab-Leiste auf dem Home-Bildschirm',
          'Installiert stapelte die Tab-Leiste ihre volle Höhe auf den Home-Indikator. Der Indikator zahlt jetzt einen Teil davon — etwa 14 px Bildschirm zurück.'],
      },
      {
        en: ['The Log stays where you left it',
          'Adding a set no longer rebuilds the screen, so it stops jumping to the top. Nor does changing a preference, a Progress window, or deleting a set.'],
        de: ['Das Training bleibt, wo du es verlassen hast',
          'Einen Satz hinzuzufügen baut den Bildschirm nicht mehr neu auf, er springt also nicht mehr nach oben. Eine Einstellung, ein Zeitraum im Fortschritt oder ein gelöschter Satz ebenso wenig.'],
      },
    ],
  },
  {
    v: 'flexloop-v14',
    items: [
      {
        en: ['The chart you touched leads',
          'One tap still reads out every progress chart, but only the tooltip under your thumb is at full strength — the other three step back.'],
        de: ['Das berührte Diagramm führt',
          'Ein Tipp liest weiterhin jedes Fortschrittsdiagramm vor, aber nur der Hinweis unter deinem Daumen ist voll da — die anderen drei treten zurück.'],
      },
      {
        en: ['Shorter readings',
          '“Every set” and “Top set weight” drop the date from their tooltips. The x axis under the point already says which session it is.'],
        de: ['Kürzere Anzeigen',
          '„Jeder Satz“ und „Gewicht im schwersten Satz“ lassen das Datum aus ihren Hinweisen weg. Die x-Achse unter dem Punkt sagt schon, welche Einheit es ist.'],
      },
      {
        en: ['Which way the trend is going',
          'The volume trend line in a tooltip is now led by ↑, ↓ or → — where the average moved since the session before it.'],
        de: ['Wohin der Trend geht',
          'Die Volumen-Trendlinie im Hinweis wird jetzt von ↑, ↓ oder → angeführt — wohin sich der Durchschnitt seit der Einheit davor bewegt hat.'],
      },
      {
        en: ['English dates everywhere',
          'Dates no longer follow the phone’s language: “20 Jul”, not “20. Juli”, on every handset.'],
        de: ['Überall englische Daten',
          'Daten folgen nicht mehr der Sprache des Telefons: „20 Jul“, nicht „20. Juli“, auf jedem Gerät. (Seit v26 folgen sie der Sprache der App.)'],
      },
    ],
  },
  {
    v: 'flexloop-v13',
    items: [
      {
        en: ['A target under the ghost',
          'Each exercise card says what would beat your own number today — “Beat 94.5 kg e1RM · 80×7”. It updates as you log and says so once you clear it.'],
        de: ['Ein Ziel unter dem Schatten',
          'Jede Übungskarte sagt, was heute deinen eigenen Wert schlagen würde — „Schlag 94,5 kg e1RM · 80×7“. Sie zieht beim Aufzeichnen mit und sagt es, sobald du es knackst.'],
      },
      {
        en: ['Tick the set that beats it',
          'The row is marked, the phone buzzes, and a toast names the new number the moment a set carries the exercise past its target.'],
        de: ['Hak den Satz ab, der es schlägt',
          'Die Zeile wird markiert, das Telefon vibriert, und ein Hinweis nennt die neue Zahl in dem Moment, in dem ein Satz die Übung über ihr Ziel trägt.'],
      },
      {
        en: ['Next target, and a streak',
          'Progress → Per exercise gains what it would take to beat your all-time best, how long that best has stood, and whether recent sessions are climbing.'],
        de: ['Nächstes Ziel, und eine Serie',
          'Fortschritt → Pro Übung bekommt dazu, was es bräuchte, um deine Bestleistung zu schlagen, wie lange sie schon steht, und ob die letzten Einheiten steigen.'],
      },
      {
        en: ['Finishing reads back',
          'A session ends with a per-exercise read-out — best ever, up, level or down — instead of a one-line toast.'],
        de: ['Das Beenden liest zurück',
          'Eine Einheit endet mit einer Auswertung je Übung — Bestleistung, besser, gleich oder schlechter — statt mit einem einzeiligen Hinweis.'],
      },
      {
        en: ['Pick the metric',
          'Settings → Motivation chooses what all of that measures: estimated 1RM, heaviest set, reps at your working weight, volume, or none.'],
        de: ['Wähl die Größe',
          'Einstellungen → Motivation wählt, was das alles misst: geschätztes 1RM, schwerster Satz, Wdh. beim Arbeitsgewicht, Volumen oder keine.'],
      },
    ],
  },
  {
    v: 'flexloop-v12',
    items: [
      {
        en: ['One tap reads the whole column',
          'Picking a session in any per-exercise chart now opens the tooltip in all of them, so one touch answers what happened in that session.'],
        de: ['Ein Tipp liest die ganze Spalte',
          'Eine Einheit in einem Übungsdiagramm anzutippen öffnet den Hinweis jetzt in allen, eine Berührung beantwortet also, was in dieser Einheit passiert ist.'],
      },
      {
        en: ['Clearer tooltips',
          'Volume per session reads “Total · 480 kg” above its trend line, and top set weight reads weight, then reps, then date.'],
        de: ['Klarere Hinweise',
          'Volumen pro Einheit liest „Gesamt · 480 kg“ über seiner Trendlinie, und das Gewicht im schwersten Satz liest Gewicht, dann Wiederholungen, dann Datum.'],
      },
      {
        en: ['Reps from zero',
          'The rep axis of “Every set” starts at zero, so a dot’s height is the rep count itself. Its legend now lists the line before the bars.'],
        de: ['Wiederholungen ab null',
          'Die Wiederholungsachse von „Jeder Satz“ beginnt bei null, die Höhe eines Punktes ist also die Wiederholungszahl selbst. Die Legende nennt jetzt die Linie vor den Balken.'],
      },
    ],
  },
  {
    v: 'flexloop-v11',
    items: [
      {
        en: ['Version and history',
          'The Settings footer prints the build version — the same string the service worker caches under. Tap it for this list.'],
        de: ['Version und Verlauf',
          'Der Fuß der Einstellungen druckt die Version — dieselbe Zeichenkette, unter der der Service Worker zwischenspeichert. Tippe sie an für diese Liste.'],
      },
      {
        en: ['Averaged over is editable',
          'The trend length dropdown ends in “Edit this list…” like the other two. Any length from 2 to 60 sessions.'],
        de: ['Gemittelt über ist bearbeitbar',
          'Die Liste der Trendlängen endet wie die anderen beiden mit „Diese Liste bearbeiten…“. Jede Länge von 2 bis 60 Einheiten.'],
      },
      {
        en: ['Backups nag sooner',
          'The reminder to export now appears six days after your last backup rather than thirty. iOS can clear a site’s storage in about a week.'],
        de: ['Backups mahnen früher',
          'Die Erinnerung zu exportieren erscheint jetzt sechs statt dreißig Tage nach dem letzten Backup. iOS kann den Speicher einer Seite in etwa einer Woche leeren.'],
      },
    ],
  },
  {
    v: 'flexloop-v10',
    items: [
      {
        en: ['Settings tab',
          'The Data tab became Settings — same glyph, same place. Old #/data links still work.'],
        de: ['Tab Einstellungen',
          'Aus dem Tab Daten wurden die Einstellungen — gleiches Zeichen, gleiche Stelle. Alte #/data-Links funktionieren weiter.'],
      },
      {
        en: ['Editable dropdowns',
          'Rest timer and Weight step offer “Edit this list…”, where their values can be added to, trimmed, or reset to defaults.'],
        de: ['Bearbeitbare Auswahllisten',
          'Pausentimer und Gewichtsschrittweite bieten „Diese Liste bearbeiten…“, wo sich ihre Werte ergänzen, kürzen oder zurücksetzen lassen.'],
      },
      {
        en: ['Plot settings',
          'The moving-average controls moved into their own section, with a note spelling out the arithmetic of whichever average is picked.'],
        de: ['Diagramm-Einstellungen',
          'Die Bedienelemente des gleitenden Durchschnitts zogen in einen eigenen Abschnitt, mit einer Notiz, die die Rechnung des gewählten Durchschnitts ausschreibt.'],
      },
      {
        en: ['Per-tab help',
          'The topbar (i) explains the screen you are on rather than only the Log.'],
        de: ['Hilfe je Tab',
          'Das (i) in der Kopfzeile erklärt den Bildschirm, auf dem du bist, statt nur das Training.'],
      },
      {
        en: ['Light theme',
          'A light palette, “Match system”, and a sun/moon toggle beside the wordmark. Applied before first paint, so no dark flash.'],
        de: ['Helles Design',
          'Eine helle Palette, „Wie das System“ und ein Sonne/Mond-Schalter neben dem Schriftzug. Wird vor dem ersten Zeichnen angewandt, also kein dunkles Aufblitzen.'],
      },
    ],
  },
  {
    v: 'flexloop-v9',
    items: [
      {
        en: ['Volume trend line',
          'Volume per session can carry a simple or exponential moving average. It runs over the whole history and is then cut to the window on screen.'],
        de: ['Trendlinie fürs Volumen',
          'Volumen pro Einheit kann einen einfachen oder exponentiellen gleitenden Durchschnitt tragen. Er läuft über die ganze Historie und wird dann auf den sichtbaren Zeitraum zugeschnitten.'],
      },
      {
        en: ['No highlight you did not ask for',
          'Bar charts stopped lighting their newest bar. A highlight is now only ever the result of a tap.'],
        de: ['Keine Hervorhebung ohne Aufforderung',
          'Balkendiagramme leuchten ihren neuesten Balken nicht mehr an. Eine Hervorhebung ist jetzt immer das Ergebnis eines Tipps.'],
      },
    ],
  },
  {
    v: 'flexloop-v8',
    items: [
      {
        en: ['Selections stick on touch',
          'A tapped datapoint stays selected after your thumb lifts, and the session it belongs to is marked in every chart of that exercise.'],
        de: ['Auswahlen bleiben haften',
          'Ein angetippter Datenpunkt bleibt ausgewählt, wenn dein Daumen abhebt, und die zugehörige Einheit ist in jedem Diagramm dieser Übung markiert.'],
      },
    ],
  },
  {
    v: 'flexloop-v7',
    items: [
      {
        en: ['Every-set chart',
          'One bar per set on a weight axis with those sets’ reps as a line, sitting between Estimated 1RM and Volume per session.'],
        de: ['Diagramm für jeden Satz',
          'Ein Balken je Satz auf einer Gewichtsachse, mit den Wiederholungen dieser Sätze als Linie, zwischen Geschätztes 1RM und Volumen pro Einheit.'],
      },
    ],
  },
  {
    v: 'flexloop-v6',
    items: [
      {
        en: ['One x scale',
          'Every progress chart shares one horizontal geometry, so a session sits at the same place in each of them and gaps are real time.'],
        de: ['Eine x-Skala',
          'Jedes Fortschrittsdiagramm teilt sich eine waagerechte Geometrie, eine Einheit sitzt also in jedem an derselben Stelle, und Lücken sind echte Zeit.'],
      },
    ],
  },
  {
    v: 'flexloop-v5',
    items: [
      {
        en: ['Column labels',
          'The weight and reps columns in the Log say which is which.'],
        de: ['Spaltenbeschriftungen',
          'Die Gewichts- und Wiederholungsspalten im Training sagen, welche welche ist.'],
      },
    ],
  },
  {
    v: 'flexloop-v4',
    items: [
      {
        en: ['Info button',
          'The topbar gained (i), explaining how to edit a set.'],
        de: ['Info-Knopf',
          'Die Kopfzeile bekam ein (i), das erklärt, wie man einen Satz bearbeitet.'],
      },
    ],
  },
  {
    v: 'flexloop-v3',
    items: [
      {
        en: ['Routines',
          'Save a session’s exercises and set counts as a routine, then start from it later. Routines travel in a backup. Schema v2.'],
        de: ['Routinen',
          'Speichere Übungen und Satzzahlen einer Einheit als Routine und starte später daraus. Routinen reisen im Backup mit. Schema v2.'],
      },
    ],
  },
  {
    v: 'flexloop-v2',
    items: [
      {
        en: ['Jump to the charts',
          'Tapping an exercise name in the Log opens that exercise on Progress → Per exercise.'],
        de: ['Sprung zu den Diagrammen',
          'Ein Tipp auf einen Übungsnamen im Training öffnet diese Übung unter Fortschritt → Pro Übung.'],
      },
    ],
  },
  {
    v: 'flexloop-v1',
    items: [
      {
        en: ['First release',
          'Offline gym journal: logging, history, progress charts, JSON backup and restore, Strongify CSV import, and a Home Screen shell that works with no network.'],
        de: ['Erste Fassung',
          'Offline-Trainingstagebuch: Aufzeichnen, Verlauf, Fortschrittsdiagramme, JSON-Backup und -Wiederherstellung, Strongify-CSV-Import und eine Home-Bildschirm-Hülle, die ohne Netz läuft.'],
      },
    ],
  },
];
