# Piper (Wyoming)

Gladys spricht mit einer Stimme, die in deinem eigenen Netzwerk läuft:
**Piper** oder jeder Sprachausgabe-Server, der das **Wyoming**-Protokoll
spricht (das von Rhasspy und Home Assistant). Kein Konto, keine Cloud: die
Texte verlassen dein Zuhause nicht.

## Was du bekommst

- Eine **Stimme** für Gladys: die Szenen-Aktion „Benachrichtigung abspielen“
  spricht damit auf deinen Lautsprechern (Sonos, Google Cast…).
- Eine automatische Wahl der Stimme nach der Sprache von Gladys (Französisch,
  Englisch, Deutsch, Spanisch) oder die Stimmen, die du angibst.
- Den Zustand des Servers im Bildschirm **Supervision** und zwei
  Szenen-Auslöser, wenn er nicht mehr oder wieder antwortet.

## Voraussetzungen

- **Gladys 5.3** oder neuer.
- Ein Wyoming-Sprachausgabe-Server, den Gladys erreicht, zum Beispiel Piper in
  Docker:

  ```bash
  docker run -d --name piper -p 10200:10200 -v piper-data:/data \
    rhasspy/wyoming-piper --voice de_DE-thorsten-medium
  ```

  Das Piper-Add-on von Home Assistant geht auch (Port 10200). Piper lädt eine
  Stimme herunter, wenn sie zum ersten Mal verlangt wird.

## Konfiguration

1. Trage **Serveradresse** (IP-Adresse oder Name des Rechners mit dem Server)
   und **Port** (10200 für Piper) ein. Eine aus Home Assistant kopierte
   Adresse, `tcp://192.168.1.20:10200`, wird so übernommen.
2. **Bevorzugte Stimmen** (optional): Stimmennamen, durch Kommas getrennt,
   zum Beispiel `de_DE-thorsten-medium, en_US-lessac-medium`. Für jede
   Sprache nimmt Gladys die erste gelistete Stimme dieser Sprache; für eine
   Sprache ohne gelistete Stimme wählt es eine, die der Server anbietet
   (`fr_FR-siwis-medium`, `en_US-lessac-medium`, `de_DE-thorsten-medium`,
   `es_ES-davefx-medium` bei Piper). Die erste gelistete Stimme spricht auch
   die Sprachen, für die es keine Stimme gibt. Eine Stimme mit mehreren
   Sprechern bekommt den Sprecher nach einem Doppelpunkt:
   `fr_FR-upmc-medium:pierre`. Die Piper-Stimmen kannst du auf
   [ihrer Beispielseite](https://rhasspy.github.io/piper-samples/) anhören.
3. **Audioformat**: **MP3** (Standard) läuft auf allen Lautsprechern, auch
   Google Cast. **WAV** spart die Kodierung, ist aber achtmal größer.
4. Speichere, öffne dann **Integrationen → Künstliche Intelligenz**, Karte
   **Stimme**, und wähle **Piper (Wyoming)**.

## Aktionen

- **Stimme testen**: erzeugt einen Satz (oder deinen **Text (optional)**) in
  der gewählten **Sprache** und meldet die genutzte Stimme, die Dauer des
  Clips, seine Größe und die benötigte Zeit. Beim ersten Mal für eine Stimme,
  die Piper noch nicht heruntergeladen hat, wartet sie auf den Download (bis
  zu zwei Minuten): starte sie einmal pro Sprache, bevor du dich auf
  Durchsagen verlässt.
- **Stimmen anzeigen**: ohne Sprache die Stimme, die jede Sprache von Gladys
  nutzt; mit einer **Sprache** alle Stimmen des Servers dafür.

## Szenen

Zwei Auslöser in der Kategorie **Integrationen** des Szenen-Editors:

- **Sprachserver nicht erreichbar**: der Wyoming-Server antwortet nicht mehr
  (jede Minute geprüft). Durchsagen schlagen fehl, bis er zurück ist: ein
  guter Moment, dir eine Nachricht zu schicken.
- **Sprachserver wieder da**: er antwortet wieder.

## Grenzen

- Gladys kürzt Texte auf 2.000 Zeichen und wartet 30 Sekunden auf den Clip.
  Ein langer Text dauert länger (gemessen auf einem Mini-PC: 2.000 Zeichen,
  zwei Minuten Sprache, in etwa 40 Sekunden): die Integration schickt dann
  den fertigen Anfang, dort etwa 50 Sekunden Sprache, auf einem Raspberry Pi
  weniger.
- Gladys nimmt Clips bis 5 MB an: ein langer WAV-Clip wird heruntergerechnet
  (16 kHz, dann 11 kHz, dann 8 kHz), damit er passt. MP3 kommt nie in die
  Nähe.
- Der Sprachassistent von Gladys bleibt mit einer lokalen Stimme bei Text
  (eine Grenze der Browser, in der Gladys-Dokumentation beschrieben): diese
  Stimme dient den Durchsagen der Szenen.
- Die Geschwindigkeit der Stimme ist nicht einstellbar: das Wyoming-Protokoll
  kennt diese Einstellung nicht.
- Gegen einen echten Piper-Server in Docker getestet, noch nicht mit allen
  Lautsprecher-Marken: Rückmeldungen sind willkommen.

## Fehlerbehebung

- **Der Wyoming-Server antwortet nicht**: prüfe Adresse und Port und ob der
  Port im Netzwerk offen ist (`-p 10200:10200` in Docker).
- **Der Wyoming-Server hat den Text abgelehnt (unbekannte Stimme?)**: der
  Stimmenname ist falsch, oder Piper konnte sie nicht herunterladen (kein
  Internet auf dem Server). **Stimmen anzeigen** liefert die genauen Namen.
- **Dieser Wyoming-Server bietet keine Sprachausgabe**: der Port gehört zu
  einem Spracherkennungs- oder Weckwort-Dienst (Whisper: 10300,
  openWakeWord: 10400).
- Setze `LOG_LEVEL=debug`, um jede Synthese in den Logs zu sehen (Länge des
  Textes, Stimme, Dauer, Größe; nie den Text selbst).

## Support

Fragen und Fehler:
[github.com/guim31/gladys-wyoming/issues](https://github.com/guim31/gladys-wyoming/issues).
