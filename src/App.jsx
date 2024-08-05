import './App.css'
import data from './mock_data/pivot_data.json'
import PivotTable from './components/pivotTable';

function App() {

  return (
    <>
      <PivotTable data={data} />
    </>
  )
}

export default App
