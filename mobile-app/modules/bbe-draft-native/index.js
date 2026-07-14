// Optional convenience export. App code goes through src/draft/liveActivity.js
// (requireOptionalNativeModule) so Expo Go / web keep working without this pod.
import { requireNativeModule } from 'expo';

export default requireNativeModule('BBEDraftNative');
