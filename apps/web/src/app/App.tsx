import { Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { Overview } from '../pages/Overview';
import { RiskRegister } from '../pages/RiskRegister';
import { RiskNew } from '../pages/RiskNew';
import { RiskDetail } from '../pages/RiskDetail';
import { HeatMapPage } from '../pages/HeatMapPage';
import { IncidentRegister } from '../pages/IncidentRegister';
import { IncidentNew } from '../pages/IncidentNew';
import { IncidentDetail } from '../pages/IncidentDetail';
import { Departments } from '../pages/Departments';
import { People } from '../pages/People';
import { Reports } from '../pages/Reports';
import { NotFound } from '../pages/NotFound';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/risks" element={<RiskRegister />} />
        <Route path="/risks/new" element={<RiskNew />} />
        <Route path="/risks/heatmap" element={<HeatMapPage />} />
        <Route path="/risks/:code" element={<RiskDetail />} />
        <Route path="/incidents" element={<IncidentRegister />} />
        <Route path="/incidents/new" element={<IncidentNew />} />
        <Route path="/incidents/:code" element={<IncidentDetail />} />
        <Route path="/departments" element={<Departments />} />
        <Route path="/people" element={<People />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
