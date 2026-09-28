import ModularResumeWorkbench from '../src/workbench/ModularResumeWorkbench';
import WelcomeGate from '../src/workbench/WelcomeGate';

export default function Page() {
  return (
    <WelcomeGate>
      <ModularResumeWorkbench />
    </WelcomeGate>
  );
}
