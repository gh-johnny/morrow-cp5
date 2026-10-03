import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { z } from 'zod';

it('keeps camera, recording permission and the EAS push project after all config plugins', () => {
  const output = execFileSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--type', 'introspect', '--json'], {
    env: { ...process.env, EXPO_NO_DOTENV: '1' }, timeout: 20_000, maxBuffer: 4 * 1024 * 1024,
  });
  const config = z.object({
    extra: z.object({ eas: z.object({ projectId: z.uuid() }) }),
    _internal: z.object({ modResults: z.object({
      android: z.object({ manifest: z.object({ manifest: z.object({
        'uses-permission': z.array(z.object({ $: z.record(z.string(), z.string()) })),
      }) }) }),
      ios: z.object({ infoPlist: z.object({ NSCameraUsageDescription: z.string().min(1), NSMicrophoneUsageDescription: z.string().min(1) }) }),
    }) }),
  }).parse(JSON.parse(output.toString()));
  const permissions = config._internal.modResults.android.manifest.manifest['uses-permission'];
  for (const required of ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO']) {
    expect(permissions.some((permission) => permission.$['android:name'] === required && permission.$['tools:node'] !== 'remove')).toBe(true);
    expect(permissions.some((permission) => permission.$['android:name'] === required && permission.$['tools:node'] === 'remove')).toBe(false);
  }
});
