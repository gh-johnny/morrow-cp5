import { app } from './app';
const port = Number(process.env.PORT || 4000);
app.listen(port, '0.0.0.0', () => console.log(`Morrow API listening on port ${port}`));
