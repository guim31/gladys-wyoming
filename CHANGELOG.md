# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-09

### Added

- A text-to-speech voice for Gladys 5.3 (Integrations → Artificial
  Intelligence → Voice) served by Piper or any Wyoming text-to-speech server
  of the local network: the "Play a notification" scene action speaks with it.
- Automatic choice of the voice from the language of Gladys (French, English,
  German, Spanish), or an ordered list of preferred voices, multi-speaker
  voices included.
- MP3 clips (every speaker, Google Cast included) or WAV, always under the
  5 MB Gladys accepts.
- Long texts sent piece by piece: on a server too slow for the 30 s Gladys
  waits, the beginning of the announcement speaks instead of nothing.
- "Test the voice" and "Show the voices" buttons in the Configuration screen.
- Server state in Supervision, and the "Voice server unreachable" and "Voice
  server back" scene triggers.
- Documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-wyoming/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-wyoming/releases/tag/v1.0.0
