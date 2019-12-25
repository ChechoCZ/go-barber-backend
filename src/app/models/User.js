import Sequelize, { Model } from 'sequelize';

class User extends Model {
  static init(sequelize) {
    super.init(
      {
        name: Sequelize.SRING,
        email: Sequelize.SRING,
        password_hash: Sequelize.SRING,
        provider: Sequelize.BOOLEAN,
      }, 
      {
        sequelize
      }
    );
  }
}

export default User;