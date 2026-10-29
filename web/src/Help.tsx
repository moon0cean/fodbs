import { useState } from 'react';
import { useI18n } from './i18n';

export function Help({ text }: { text: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <span className="help">
      <button
        type="button"
        className="help-mark"
        aria-expanded={open}
        aria-label={t('help')}
        onClick={() => setOpen((current) => !current)}
      >
        ?
      </button>
      {open && <span className="hint help-note">{text}</span>}
    </span>
  );
}
