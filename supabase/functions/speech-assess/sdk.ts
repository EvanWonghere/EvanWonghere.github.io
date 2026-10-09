// The Speech SDK is loaded only when the detailed path is asked for, so a problem with it can never stop plain scoring from starting.
// Errors are reduced to a word on purpose: the SDK's own messages can contain the connection URL, which carries the key.
export async function assessDetail({ bytes, reference, locale, key, region, signal }: { bytes: Uint8Array; reference: string; locale: string; key: string; region: string; signal: AbortSignal }) {
    const sdk: any = await import('npm:microsoft-cognitiveservices-speech-sdk@1.52.0');
    const config = sdk.SpeechConfig.fromSubscription(key, region);
    config.setProperty(sdk.PropertyId.SpeechServiceConnection_RecognitionEndpointVersion, '1');
    config.speechRecognitionLanguage = locale;
    config.outputFormat = sdk.OutputFormat.Detailed;
    const recognizer = new sdk.SpeechRecognizer(config, sdk.AudioConfig.fromWavFileInput(bytes));
    const assessment = new sdk.PronunciationAssessmentConfig(reference, sdk.PronunciationAssessmentGradingSystem.HundredMark, sdk.PronunciationAssessmentGranularity.Phoneme, true);
    assessment.phonemeAlphabet = 'IPA'; assessment.nbestPhonemeCount = 5; assessment.enableProsodyAssessment = true;
    assessment.applyTo(recognizer);
    try {
        return await new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
            recognizer.canceled = (_sender: unknown, event: any) => { if (event.reason === sdk.CancellationReason.Error) reject(new Error('canceled')); };
            recognizer.recognizeOnceAsync((result: any) => {
                if (result.reason === sdk.ResultReason.NoMatch) { resolve({ RecognitionStatus: 'NoMatch' }); return; }
                if (result.reason !== sdk.ResultReason.RecognizedSpeech) { reject(new Error('not recognized')); return; }
                resolve(JSON.parse(result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)));
            }, () => reject(new Error('failed')));
        });
    } finally { recognizer.close(); }
}
