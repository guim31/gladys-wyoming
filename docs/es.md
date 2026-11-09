# Piper (Wyoming)

Gladys habla con una voz que funciona en su propia red: **Piper**, o
cualquier servidor de síntesis de voz que hable el protocolo **Wyoming** (el
de Rhasspy y Home Assistant). Sin cuenta ni nube: los textos no salen de su
casa.

## Lo que obtiene

- Una **voz** para Gladys: la acción de escena «Reproducir una notificación»
  habla con ella en sus altavoces (Sonos, Google Cast…).
- Una elección automática de la voz según el idioma de Gladys (francés,
  inglés, alemán, español), o las voces que usted indique.
- El estado del servidor en la pantalla **Supervisión**, y dos
  desencadenadores de escena cuando deja de responder o vuelve a hacerlo.

## Requisitos

- **Gladys 5.3** o posterior.
- Un servidor de síntesis de voz Wyoming accesible desde Gladys, por ejemplo
  Piper en Docker:

  ```bash
  docker run -d --name piper -p 10200:10200 -v piper-data:/data \
    rhasspy/wyoming-piper --voice es_ES-davefx-medium
  ```

  El complemento Piper de Home Assistant también sirve (puerto 10200). Piper
  descarga una voz la primera vez que se le pide.

## Configuración

1. Rellene **Dirección del servidor** (dirección IP o nombre de la máquina que
   ejecuta el servidor) y **Puerto** (10200 para Piper). Una dirección copiada
   de Home Assistant, `tcp://192.168.1.20:10200`, se acepta tal cual.
2. **Voces preferidas** (opcional): nombres de voces separados por comas, por
   ejemplo `es_ES-davefx-medium, en_US-lessac-medium`. Para cada idioma,
   Gladys usa la primera voz de la lista en ese idioma; para un idioma sin voz
   en la lista, elige una que ofrezca el servidor (`fr_FR-siwis-medium`,
   `en_US-lessac-medium`, `de_DE-thorsten-medium`, `es_ES-davefx-medium` con
   Piper). La primera voz de la lista habla también los idiomas que ninguna
   voz habla. Una voz con varios locutores lleva su locutor tras dos puntos:
   `fr_FR-upmc-medium:pierre`. Las voces de Piper se escuchan en
   [su página de ejemplos](https://rhasspy.github.io/piper-samples/).
3. **Formato de audio**: el **MP3** (por defecto) funciona en todos los
   altavoces, Google Cast incluido. El **WAV** evita la codificación pero pesa
   unas cinco veces más.
4. Guarde, luego abra **Integraciones → Inteligencia artificial**, tarjeta
   **Voz**, y elija **Piper (Wyoming)**.

## Acciones

- **Probar la voz**: sintetiza una frase (o su **Texto (opcional)**) en el
  **Idioma** elegido e indica la voz usada, la duración del clip, su tamaño y
  el tiempo empleado. Su primer uso con una voz que Piper aún no ha
  descargado espera la descarga (hasta dos minutos): ejecútela una vez por
  idioma antes de confiar en los anuncios.
- **Mostrar las voces**: sin idioma, la voz que usará cada idioma de Gladys;
  con un **Idioma**, todas las voces del servidor para él.

## Escenas

Dos desencadenadores, en la categoría **Integraciones** del editor de
escenas:

- **Servidor de voz inaccesible**: el servidor Wyoming ha dejado de responder
  (comprobado cada minuto). Los anuncios fallan hasta que vuelva: buen momento
  para enviarse un mensaje.
- **Servidor de voz de vuelta**: vuelve a responder.

## Límites

- Gladys corta los textos a 2000 caracteres y espera el clip 30 segundos. Un
  texto largo tarda más (medido en un mini PC: 2000 caracteres, dos minutos
  de voz, en unos 40 segundos): la integración envía entonces el comienzo ya
  listo, unos 50 segundos de voz en ese mini PC, menos en una Raspberry Pi.
- Gladys acepta clips de 5 MB como máximo: un clip WAV largo se remuestrea
  (16 kHz, luego 11 kHz, luego 8 kHz) para que quepa. El MP3 nunca se acerca.
- El asistente de voz de Gladys se queda en texto con una voz local (un límite
  de los navegadores descrito en la documentación de Gladys): esta voz sirve
  para los anuncios de las escenas.
- La velocidad de la voz no se puede ajustar: el protocolo Wyoming no tiene
  ese ajuste.
- Probado contra un servidor Piper real en Docker, aún no con todas las
  marcas de altavoces: sus comentarios son bienvenidos.

## Solución de problemas

- **El servidor Wyoming no responde**: compruebe la dirección y el puerto, y
  que el puerto esté abierto a la red (`-p 10200:10200` en Docker).
- **El servidor Wyoming ha rechazado el texto (¿voz desconocida?)**: el nombre
  de la voz es incorrecto, o Piper no pudo descargarla (sin internet en el
  servidor). **Mostrar las voces** da los nombres exactos.
- **Este servidor Wyoming no ofrece síntesis de voz**: el puerto es el de un
  servicio de reconocimiento de voz o de palabra de activación (Whisper:
  10300, openWakeWord: 10400).
- Ajuste `LOG_LEVEL=debug` para ver cada síntesis en los registros (longitud
  del texto, voz, duración, tamaño; nunca el texto en sí).

## Soporte

Preguntas y errores:
[github.com/guim31/gladys-wyoming/issues](https://github.com/guim31/gladys-wyoming/issues).
