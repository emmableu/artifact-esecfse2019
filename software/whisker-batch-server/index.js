const express = require('express')
const app = express()
const cors = require('cors')
const port = 3000
const fs = require('fs')
const path = require('path')

app.use(cors())
app.use(express.json({limit: '50mb'}))
app.use(express.urlencoded({ extended: true, limit: '50mb'}))

const projectInputFolder = 'scratch_projects'
const scriptInputFolder = 'test_scripts'
const outputFolder = 'dumped_traces'

app.get('/', (req, res) => {
  res.send('Welcome')
})

app.get('/project_list', (req, res) => {
  
  projectList = fs.readdirSync(projectInputFolder)
                  .filter(fileName => 
                          fs.lstatSync(path.join(projectInputFolder, fileName))
                            .isFile())
  res.json(projectList)

})

app.get('/scratch_project/:filename', (req, res) => {
  const options = { 
    root: path.join(__dirname) 
  }; 
  const fileName = req.params.filename;
  res.sendFile(path.join(projectInputFolder, fileName), options, function (err) { 
      if (err) { 
         next(err); 
      } else { 
        console.log(`sent ${fileName} to the client`); 
      } 
  }); 
})

app.get('/test_script', (req, res) => {
  const scriptName = 'tests-random.js'
  fs.readFile(`${scriptInputFolder}/${scriptName}`, 'utf8' , 
  (err, data) => {
    if (err) {
      console.error(err)
      return
    }
    console.log(`sent ${scriptName} to the client`)
    res.send(data)
  })
})

app.post('/save_trace/:i', (req, res) => {
  console.log(`received trace of \x1b[36m${req.body.testName}\x1b[0m with coverage ${req.body.coverage}`)
  const OutputFolder = path.join(outputFolder, req.body.testName)
  if (!fs.existsSync(OutputFolder)){
    fs.mkdirSync(OutputFolder);
  }
  fs.writeFile(`${OutputFolder}/${req.body.testName}-${req.params.i}.json`, req.body.trace, err => {
    if (err) {
      console.error(err)
      return
    }
  })
  res.send('ok')
})

app.listen(port, () => {
  console.log(`listening at http://localhost:${port}`)
})
