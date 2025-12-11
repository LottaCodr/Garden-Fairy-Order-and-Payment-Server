

import logger from 'jet-logger';

import ENV from '@src/common/constants/ENV';
import server from './server';
import app from "./server";
import { connectDB } from './db';


/******************************************************************************
                                Constants
******************************************************************************/

const SERVER_START_MSG = (
  'Express server started on port: ' + ENV.Port.toString()
);


/******************************************************************************
                                  Run
******************************************************************************/
const bootstrap = async () => {
  await connectDB();
  app.listen(ENV.Port, () => {
    console.log(`Server running on port ${ENV.Port}`);
  });
};
bootstrap();

// Start the server
server.listen(ENV.Port, err => {
  if (!!err) {
    logger.err(err.message);
  } else {
    logger.info(SERVER_START_MSG);
  }
});
