import { registerWebModule, NativeModule } from 'expo';
import { FallDetectionModuleType } from './FallDetection.types';

// No-op stub: a browser can't run a persistent background foreground
// service the way Android does. Background fall detection is Android-only
// (see mobile/src/services/fallDetectionService.ts, which guards every
// call behind Platform.OS === "android").
class FallDetectionModule extends NativeModule<{}> implements FallDetectionModuleType {
  startMonitoring(): boolean {
    return false;
  }
  stopMonitoring(): boolean {
    return false;
  }
  isMonitoring(): boolean {
    return false;
  }
}

export default registerWebModule(FallDetectionModule, 'FallDetectionModule');
