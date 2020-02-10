import * as Yup from 'yup';
import { startOfHour, parseISO, isBefore, format, subHours } from 'date-fns';

import Appointment from '../models/Appointment';
import User from '../models/User';
import File from '../models/File';
import CancelationMail from '../jobs/CancelationMail';

import Notification from '../schemas/Notification';
import Queue from '../../lib/Queue';

class AppointmentController {
  async index(req, res) {
    const { page = 1 } = req.query;

    const appointments = await Appointment.findOne({
      where: {
        user_id: req.userId,
        canceled_at: null,
      },
      order: ['date'],
      attributes: ['id', 'date'],
      limit: 20,
      offset: (page - 1) * 20,
      include: {
        model: User,
        as: 'provider',
        attributes: ['id', 'name'],
        include: {
          model: File,
          as: 'avatar',
          attributes: ['id', 'path', 'url']
        }
      }
    });

    return res.json(appointments);
  }

  async store(req, res) {
    const schema = Yup.object().shape({
      provider_id: Yup.number().required(),
      date: Yup.date().required()
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Validation failed' });
    }

    const { provider_id, date } = req.body;

    const isProvider = await User.findOne({
      where: {
        id: provider_id,
        provider: true
      }
    });

    if (!isProvider) {
      return res.status(401).json({ error: 'You can only create appointments with providers' });
    }

    if (provider_id === req.userId) {
      return res.status(401).json({ error: 'You cannot create appointment with yourself!' });
    }

    const hourStart = startOfHour(parseISO(date));

    if (isBefore(hourStart, new Date())) {
      return res.status(400).json({ error: 'Past hours are not allowed' });
    }

    const checkAvailability = await Appointment.findOne({
      where: {
        provider_id,
        canceled_at: null,
        date: hourStart
      }
    });

    if (checkAvailability) {
      return res.status(400).json({ error: 'Appointment date not available' });
    }

    const appointment = await Appointment.create({
      user_id: req.userId,
      provider_id,
      date: hourStart
    });

    /* Notify Provider */
    const user = await User.findByPk(req.userId);
    const formattedDate = format(hourStart, "MMMM dd', at' H:mm")

    await Notification.create({
      content: `New appointmet created by ${user.name} on ${formattedDate}`,
      user: provider_id
    });

    return res.json(appointment);
  }

  async destroy(req, res) {
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['name', 'email']
        },
        {
          model: User,
          as: 'user',
          attributes: ['name']
        }
      ]
    });

    if (appointment.user_id !== req.userId) {
      return res.status(401).json({ error: "You don't have permission to delete this appointment" });
    }

    const dateWithSub = subHours(appointment.date, 3);

    if (isBefore(dateWithSub, new Date())) {
      return res.status(401).json({ error: 'You can only cancel appointments until 3 hours before scheduled time' });
    }

    appointment.canceled_at = new Date();

    await appointment.save();

    await Queue.add(CancelationMail.key, {
      appointment
    });

    return res.json(appointment);
  }
}

export default new AppointmentController();