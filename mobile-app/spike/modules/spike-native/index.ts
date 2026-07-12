import { requireNativeModule } from 'expo';

type SpikeNativeModuleType = {
  hello(): string;
  isCaptured(): boolean;
};

const SpikeNative = requireNativeModule<SpikeNativeModuleType>('SpikeNative');

export function hello(): string {
  return SpikeNative.hello();
}

export function isCaptured(): boolean {
  return SpikeNative.isCaptured();
}
