import { BrowserRouter } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StatusBanners } from './components/StatusBanners';
import { LanguageSwitcher } from './components/LanguageSwitcher';

function App() {
  const { t } = useTranslation();

  return (
    <BrowserRouter>
      <StatusBanners />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderBottom: '1px solid #e5e7eb' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>{t('app.title')}</h1>
        <LanguageSwitcher />
      </header>
      <main style={{ padding: '24px' }}>
        {/* Routes will be added here */}
      </main>
    </BrowserRouter>
  );
}

export default App;
