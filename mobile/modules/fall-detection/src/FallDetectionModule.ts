import { NativeModule, requireNativeModule } from 'expo';
import { FallDetectionModuleType } from './FallDetection.types';

declare class FallDetectionModule extends NativeModule<{}> implements FallDetectionModuleType {
  startMonitoring(token: string, apiBaseUrl: string): boolean;
  stopMonitoring(): boolean;
  isMonitoring(): boolean;
}

export default requireNativeModule<FallDetectionModule>('FallDetection');
