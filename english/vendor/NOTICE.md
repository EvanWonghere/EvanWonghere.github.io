# Third-party software

`speech-sdk-1.52.0.js` is the unmodified minified browser bundle from Microsoft's
`microsoft-cognitiveservices-speech-sdk` npm package, version 1.52.0 (MIT).
Its package LICENSE is retained as `SPEECH-SDK-LICENSE.txt`.

Source: https://github.com/microsoft/cognitive-services-speech-sdk-js
Distribution: https://registry.npmjs.org/microsoft-cognitiveservices-speech-sdk/-/microsoft-cognitiveservices-speech-sdk-1.52.0.tgz
The archive was checked against npm's SHA-512 integrity value before extraction.

The authentication client is imported from the existing, unmodified
`../music/vendor/supabase-js-2.112.4.mjs`; its licence is recorded in
`static/music/vendor/NOTICE.md`.

`../diagnostic.wav` is Microsoft's public pronunciation-assessment sample
(2.03 seconds, PCM16 mono 16kHz): "What's the weather like?"
Source pinned to Azure-Samples/cognitive-services-speech-sdk commit
6e3d0b2118d40dfa91a89ca114665a91e7454035:
https://github.com/Azure-Samples/cognitive-services-speech-sdk/blob/6e3d0b2118d40dfa91a89ca114665a91e7454035/scenarios/python/console/language-learning/resources/whats_the_weather_like.wav
The repository's MIT licence is retained as `SPEECH-SAMPLES-LICENSE.txt`.
