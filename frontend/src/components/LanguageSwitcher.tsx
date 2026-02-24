import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'te', label: 'తెలుగు' },
];

/** Language switcher — persists choice to localStorage (task 11.5). */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const lang = e.target.value;
    i18n.changeLanguage(lang);
    localStorage.setItem('lang', lang);
  }

  return (
    <select
      value={i18n.language}
      onChange={handleChange}
      aria-label="Select language"
      style={{ padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}
    >
      {LANGUAGES.map(l => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
