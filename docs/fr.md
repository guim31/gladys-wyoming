# Piper (Wyoming)

Gladys parle avec une voix qui tourne sur votre propre réseau : **Piper**, ou
tout serveur de synthèse vocale qui parle le protocole **Wyoming** (celui de
Rhasspy et de Home Assistant). Ni compte ni cloud : les textes ne quittent
pas la maison.

## Ce que vous obtenez

- Une **voix** pour Gladys : l'action de scène « Jouer une notification » la
  fait parler sur vos enceintes (Sonos, Google Cast…).
- Un choix automatique de la voix selon la langue de Gladys (français,
  anglais, allemand, espagnol), ou les voix que vous indiquez.
- L'état du serveur dans l'écran **Supervision**, et deux déclencheurs de
  scène quand il cesse de répondre ou répond de nouveau.

## Prérequis

- **Gladys 5.3** ou plus récent.
- Un serveur de synthèse vocale Wyoming joignable depuis Gladys, par exemple
  Piper sous Docker :

  ```bash
  docker run -d --name piper -p 10200:10200 -v piper-data:/data \
    rhasspy/wyoming-piper --voice fr_FR-siwis-medium
  ```

  Le module Piper de Home Assistant convient aussi (port 10200). Piper
  télécharge une voix la première fois qu'on la lui demande.

## Configuration

1. Renseignez **Adresse du serveur** (adresse IP ou nom de la machine qui fait
   tourner le serveur) et **Port** (10200 pour Piper). Une adresse copiée
   depuis Home Assistant, `tcp://192.168.1.20:10200`, est acceptée telle
   quelle.
2. **Voix préférées** (facultatif) : des noms de voix séparés par des
   virgules, par exemple `fr_FR-siwis-medium, en_US-lessac-medium`. Pour
   chaque langue, Gladys prend la première voix listée de cette langue ; pour
   une langue sans voix listée, il en choisit une que le serveur propose
   (`fr_FR-siwis-medium`, `en_US-lessac-medium`, `de_DE-thorsten-medium`,
   `es_ES-davefx-medium` pour Piper). La première voix listée parle aussi les
   langues qu'aucune voix ne parle. Une voix à plusieurs locuteurs prend son
   locuteur après deux-points : `fr_FR-upmc-medium:pierre`. Les voix de Piper
   s'écoutent sur [sa page d'exemples](https://rhasspy.github.io/piper-samples/).
3. **Format audio** : le **MP3** (par défaut) passe sur toutes les enceintes,
   Google Cast compris. Le **WAV** évite l'encodage mais pèse environ cinq fois plus.
4. Enregistrez, puis ouvrez **Intégrations → Intelligence artificielle**,
   carte **Voix**, et choisissez **Piper (Wyoming)**.

## Actions

- **Tester la voix** : synthétise une phrase (ou votre **Texte
  (facultatif)**) dans la **Langue** choisie et indique la voix utilisée, la
  durée du clip, sa taille et le temps mis. Sa première utilisation pour une
  voix que Piper n'a pas encore téléchargée attend le téléchargement (jusqu'à
  deux minutes) : lancez-la une fois par langue avant de compter sur les
  annonces.
- **Afficher les voix** : sans langue, la voix que chaque langue de Gladys
  utilisera ; avec une **Langue**, toutes les voix du serveur pour celle-ci.

## Scènes

Deux déclencheurs, dans la catégorie **Intégrations** de l'éditeur de scènes :

- **Serveur de voix injoignable** : le serveur Wyoming ne répond plus
  (vérifié chaque minute). Les annonces échouent jusqu'à son retour : bon
  moment pour vous envoyer un message.
- **Serveur de voix revenu** : il répond de nouveau.

## Limites

- Gladys coupe les textes à 2 000 caractères et attend le clip 30 secondes.
  Un long texte prend plus de temps (mesuré sur un mini-PC : 2 000
  caractères, deux minutes de parole, en 40 secondes environ) : l'intégration
  envoie alors le début déjà prêt, environ 50 secondes de parole sur ce
  mini-PC, moins sur un Raspberry Pi.
- Gladys accepte des clips de 5 Mo au plus : un long clip WAV est
  rééchantillonné (16 kHz, puis 11 kHz, puis 8 kHz) pour tenir. Le MP3 n'en
  approche jamais.
- L'assistant vocal de Gladys reste en texte avec une voix locale (une limite
  des navigateurs décrite dans la documentation de Gladys) : cette voix sert
  les annonces des scènes.
- La vitesse de la voix n'est pas réglable : le protocole Wyoming n'a pas ce
  réglage.
- Testé contre un vrai serveur Piper sous Docker, pas encore avec toutes les
  marques d'enceintes : vos retours sont les bienvenus.

## Dépannage

- **Le serveur Wyoming ne répond pas** : vérifiez l'adresse et le port, et
  que le port est ouvert au réseau (`-p 10200:10200` sous Docker).
- **Le serveur Wyoming a refusé le texte (voix inconnue ?)** : le nom de voix
  est faux, ou Piper n'a pas pu la télécharger (pas d'internet sur le
  serveur). **Afficher les voix** donne les noms exacts.
- **Ce serveur Wyoming ne propose pas de synthèse vocale** : le port est celui
  d'un service de reconnaissance vocale ou de mot d'éveil (Whisper : 10300,
  openWakeWord : 10400).
- Réglez `LOG_LEVEL=debug` pour voir chaque synthèse dans les logs (longueur
  du texte, voix, durée, taille ; jamais le texte lui-même).

## Support

Questions et bugs :
[github.com/guim31/gladys-wyoming/issues](https://github.com/guim31/gladys-wyoming/issues).
