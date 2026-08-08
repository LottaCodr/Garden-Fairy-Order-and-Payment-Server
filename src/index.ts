
import logger from 'jet-logger';

import ENV from '@src/common/constants/ENV';
import app from './server';
import { connectDB } from './db';


/******************************************************************************
                                  Run
******************************************************************************/
const bootstrap = async () => {
  await connectDB();
  app.listen(ENV.Port, () => {
    logger.info('Express server started on port: ' + ENV.Port.toString());
  });
};

bootstrap();
