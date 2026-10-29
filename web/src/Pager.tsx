import { useI18n } from './i18n';

export const PAGE_SIZE = 8;

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  const { t } = useI18n();
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button type="button" className="ghost" disabled={page <= 0} onClick={() => onPage(page - 1)}>{t('previous')}</button>
      <span>{page + 1} / {pages}</span>
      <button type="button" className="ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>{t('next')}</button>
    </div>
  );
}
