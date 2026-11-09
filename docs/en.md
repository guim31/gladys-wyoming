# Piper (Wyoming)

Gladys speaks with a voice that runs on your own network: **Piper**, or any
text-to-speech server that speaks the **Wyoming** protocol (the one of
Rhasspy and Home Assistant). No account, no cloud: the texts never leave your
home.

## What you get

- A **voice** for Gladys: the "Play a notification" scene action speaks
  through it on your speakers (Sonos, Google Cast…).
- An automatic choice of the voice from the language of Gladys (French,
  English, German, Spanish), or the voices you list.
- The state of the server in the **Supervision** screen, and two scene
  triggers when it stops or starts answering again.

## Requirements

- **Gladys 5.3** or later.
- A Wyoming text-to-speech server reachable from Gladys, for example Piper in
  Docker:

  ```bash
  docker run -d --name piper -p 10200:10200 -v piper-data:/data \
    rhasspy/wyoming-piper --voice fr_FR-siwis-medium
  ```

  The Piper add-on of Home Assistant works too (port 10200). Piper downloads a
  voice the first time it is asked for it.

## Configuration

1. Fill in **Server address** (IP address or name of the machine running the
   server) and **Port** (10200 for Piper). An address copied from Home
   Assistant, `tcp://192.168.1.20:10200`, is accepted as is.
2. **Preferred voices** (optional): voice names separated by commas, for
   example `fr_FR-siwis-medium, en_US-lessac-medium`. For each language,
   Gladys uses the first listed voice of that language; for a language with
   no listed voice, it picks one the server offers (`fr_FR-siwis-medium`,
   `en_US-lessac-medium`, `de_DE-thorsten-medium`, `es_ES-davefx-medium` for
   Piper). The first listed voice also speaks the languages no voice speaks.
   A multi-speaker voice takes its speaker after a colon:
   `fr_FR-upmc-medium:pierre`. The voices of Piper can be heard on
   [its sample page](https://rhasspy.github.io/piper-samples/).
3. **Audio format**: **MP3** (default) plays on every speaker, Google Cast
   included. **WAV** skips the encoding but weighs about five times more.
4. Save, then open **Integrations → Artificial Intelligence**, card **Voice**,
   and choose **Piper (Wyoming)**.

## Actions

- **Test the voice**: synthesizes a sentence (or your **Text (optional)**) in
  the chosen **Language** and reports the voice used, the duration of the
  clip, its size and the time it took. Its first use for a voice Piper has
  not downloaded yet waits for the download (up to two minutes): run it once
  per language before relying on announcements.
- **Show the voices**: without a language, the voice each language of Gladys
  will use; with a **Language**, every voice of the server for it.

## Scenes

Two triggers, in the **Integrations** category of the scene editor:

- **Voice server unreachable**: the Wyoming server stopped answering (checked
  every minute). Announcements fail until it is back: a good moment to send
  yourself a message.
- **Voice server back**: it answers again.

## Limits

- Gladys cuts texts at 2,000 characters and waits 30 seconds for the clip. A
  long text takes longer (measured on a mini PC: 2,000 characters, two
  minutes of speech, in about 40 seconds): the integration then sends the
  beginning it has, about 50 seconds of speech there, less on a Raspberry
  Pi.
- Gladys accepts clips of 5 MB at most: a long WAV clip is resampled down
  (16 kHz, then 11 kHz, then 8 kHz) to fit. MP3 never comes near.
- The voice assistant of Gladys stays text-only with a local voice (a browser
  limit described in the Gladys documentation): this voice serves the scene
  announcements.
- The speed of the voice is not adjustable: the Wyoming protocol has no such
  setting.
- Tested against a real Piper server in Docker, not yet with every speaker
  brand: feedback welcome.

## Troubleshooting

- **The server does not answer**: check the address and the port, and that
  the port is open to the network (`-p 10200:10200` in Docker).
- **The server refused the text (unknown voice?)**: the voice name is wrong,
  or Piper could not download it (no internet on the server). **Show the
  voices** lists the exact names.
- **This Wyoming server offers no text-to-speech**: the port is the one of a
  speech-to-text or wake-word service (Whisper: 10300, openWakeWord: 10400).
- Set `LOG_LEVEL=debug` to see every synthesis in the logs (length of the
  text, voice, duration, size; never the text itself).

## Support

Questions and bugs:
[github.com/guim31/gladys-wyoming/issues](https://github.com/guim31/gladys-wyoming/issues).
