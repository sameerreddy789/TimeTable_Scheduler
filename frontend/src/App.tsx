import { BrowserRouter } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function App() {
  const { t } = useTranslation();

  return (
    <BrowserRouter>
      <div>
        <h1>{t('app.title')}</h1>
      </div>
    </BrowserRouter>
  );
}

export default App;
