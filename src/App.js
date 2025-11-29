import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import AccountingEvents from "./pages/AccountingEvents";
import StakingRewards from "./pages/StakingRewards";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<AccountingEvents />} />
          <Route path="staking-rewards" element={<StakingRewards />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
