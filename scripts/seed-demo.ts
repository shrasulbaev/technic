// Demo data for the test server: clients, drivers around Bishkek and a few
// orders. Runs on start when SEED_DEMO=1 and only once (checks a marker user).
import pg from "pg";

const P = {
  dordoy: { name: "Дордой базар, ряд 14", lat: 42.9395, lng: 74.6185 },
  osh: { name: "Ошский рынок, вход 3", lat: 42.8746, lng: 74.5698 },
  alamedin: { name: "Аламединский рынок", lat: 42.8865, lng: 74.6283 },
  park: { name: "ТЦ Бишкек Парк", lat: 42.8755, lng: 74.5905 },
  asanbay: { name: "мкр. Асанбай, 32", lat: 42.8205, lng: 74.6253 },
  djal: { name: "мкр. Джал, 23", lat: 42.8333, lng: 74.56 },
  kokjar: { name: "Кок-Жар, 15", lat: 42.827, lng: 74.642 },
  vostok: { name: "мкр. Восток-5", lat: 42.8605, lng: 74.6705 },
  akorgo: { name: "ж/м Ак-Орго", lat: 42.902, lng: 74.548 },
  kudai: { name: "Рынок «Кудайберген»", lat: 42.8985, lng: 74.5405 },
  koitash: { name: "с. Кой-Таш", lat: 42.7135, lng: 74.665 },
  site: { name: "Стройка ЖК, ул. Ахунбаева / Шабдан Баатыра", lat: 42.8418, lng: 74.6095 },
};

// Bishkek is UTC+6 all year.
function bishkek(daysFromToday: number, hour: number, minute = 0) {
  const now = new Date(Date.now() + 6 * 3600_000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromToday, hour - 6, minute));
  return d;
}

export async function run(url: string | undefined) {
  const pool = new pg.Pool({ connectionString: url });
  try {
    const { rows } = await pool.query("select 1 from users where phone = '+996555000101'");
    if (rows.length) return;
    const types = Object.fromEntries((await pool.query("select id, code from vehicle_types")).rows.map((r) => [r.code, r.id]));

    const user = async (phone: string, name: string, role: string, ratingSum = 0, ratingCount = 0) =>
      (await pool.query("insert into users (phone, name, role, rating_sum, rating_count) values ($1,$2,$3,$4,$5) returning id", [phone, name, role, ratingSum, ratingCount])).rows[0].id as string;

    await user("+996555000001", "Администратор", "admin");
    const aigerim = await user("+996555000101", "Айгерим", "client", 48, 10);
    const nurbek = await user("+996555000102", "Нурбек (прораб)", "client", 23, 5);

    const driver = async (phone: string, name: string, code: string, plate: string, model: string, at: { lat: number; lng: number }, verification = "approved", balance = 500, rs = 47, rc = 10) => {
      const id = await user(phone, name, "driver", rs, rc);
      await pool.query(
        "insert into drivers (user_id, verification, balance, is_online, lat, lng, location_at, home_address, home_lat, home_lng) values ($1,$2,$3,true,$4,$5,now(),$6,$7,$8)",
        [id, verification, balance, at.lat, at.lng, P.djal.name, P.djal.lat, P.djal.lng],
      );
      const v = (await pool.query("insert into vehicles (driver_id, type_id, plate, model) values ($1,$2,$3,$4) returning id", [id, types[code], plate, model])).rows[0].id as string;
      return { id, v };
    };

    const azamat = await driver("+996555000201", "Азамат", "porter", "01 KG 123 ABC", "Hyundai Porter", { lat: 42.9301, lng: 74.6102 });
    const nurlan = await driver("+996555000202", "Нурлан", "porter", "01 KG 777 NBK", "Hyundai Porter", { lat: 42.8781, lng: 74.5751 }, "approved", 300, 38, 8);
    await driver("+996555000203", "Эрлан", "gazel", "02 KG 456 BBK", "ГАЗель Next", { lat: 42.8866, lng: 74.6201 });
    const bakyt = await driver("+996555000301", "Бакыт", "backhoe", "01 KG 901 JCB", "JCB 3CX", { lat: 42.8501, lng: 74.6003 }, "approved", 1500);
    await driver("+996555000302", "Тимур", "crane", "01 KG 555 KRN", "Ивановец 25 т", { lat: 42.8601, lng: 74.6403 }, "pending", 0, 0, 0);
    await driver("+996555000204", "Улан", "porter", "08 KG 321 UUU", "Kia Bongo", { lat: 42.8701, lng: 74.6303 }, "pending", 0, 0, 0);

    const order = async (o: Record<string, unknown>) => {
      const cols = Object.keys(o);
      const vals = Object.values(o);
      const r = await pool.query(`insert into orders (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`, vals);
      return r.rows[0].id as string;
    };
    const cargo = (client: string, from: (typeof P)[keyof typeof P], to: (typeof P)[keyof typeof P], extra: Record<string, unknown>) => ({
      client_id: client,
      kind: "cargo",
      type_id: types.porter,
      unit: "trip",
      pickup_address: from.name,
      pickup_lat: from.lat,
      pickup_lng: from.lng,
      dropoff_address: to.name,
      dropoff_lat: to.lat,
      dropoff_lng: to.lng,
      ...extra,
    });

    // Searching right now, near Dordoy: Azamat sees them in "Рядом".
    const now1 = await order(cargo(aigerim, P.dordoy, P.asanbay, { mode: "now", distance_km: 16.2, client_price: 1200, cargo_desc: "Мешки с товаром, 20 шт", loaders: 1 }));
    await order(cargo(nurbek, P.alamedin, P.vostok, { mode: "now", distance_km: 6.1, client_price: 700, cargo_desc: "Холодильник" }));
    // Along the way home to Djal.
    await order(cargo(aigerim, P.osh, P.djal, { mode: "now", distance_km: 6.4, client_price: 600, cargo_desc: "Стиральная машина" }));
    // An offer from Nurlan waiting for Aigerim.
    await pool.query("insert into offers (order_id, driver_id, vehicle_id, price, eta_min) values ($1,$2,$3,$4,$5)", [now1, nurlan.id, nurlan.v, 1350, 7]);

    // Scheduled: tomorrow and later.
    await order(cargo(aigerim, P.djal, P.kokjar, { mode: "scheduled", scheduled_at: bishkek(1, 8), distance_km: 11.0, client_price: 2500, cargo_desc: "Переезд, 3 этаж без лифта", loaders: 2 }));
    await order(cargo(nurbek, P.park, P.vostok, { mode: "scheduled", scheduled_at: bishkek(1, 14, 30), distance_km: 10.5, client_price: 1000, cargo_desc: "Мебель из магазина", loaders: 1 }));
    await order(cargo(nurbek, P.kudai, P.koitash, { mode: "scheduled", scheduled_at: bishkek(3, 7, 30), distance_km: 28.4, client_price: 1800, cargo_desc: "Стройматериалы" }));

    // Equipment for a building site.
    await order({
      client_id: nurbek,
      kind: "equipment",
      mode: "scheduled",
      type_id: types.backhoe,
      unit: "hour",
      pickup_address: P.site.name,
      pickup_lat: P.site.lat,
      pickup_lng: P.site.lng,
      scheduled_at: bishkek(2, 9),
      duration_hours: 4,
      client_price: 2000,
      comment: "Копать траншею под фундамент",
    });
    await order({
      client_id: nurbek,
      kind: "equipment",
      mode: "now",
      type_id: types.backhoe,
      unit: "hour",
      pickup_address: P.site.name,
      pickup_lat: P.site.lat,
      pickup_lng: P.site.lng,
      duration_hours: 3,
      client_price: 2200,
      comment: "Погрузить мусор в самосвал",
    });

    // History: a completed trip with a commission paid.
    const done = await order(
      cargo(aigerim, P.osh, P.akorgo, {
        mode: "now",
        status: "completed",
        distance_km: 9.3,
        client_price: 900,
        final_price: 900,
        total_price: 900,
        commission: 72,
        driver_id: azamat.id,
        vehicle_id: azamat.v,
        assigned_at: new Date(Date.now() - 26 * 3600_000),
        finished_at: new Date(Date.now() - 25 * 3600_000),
      }),
    );
    await pool.query("insert into wallet_tx (driver_id, kind, amount, provider, note, created_at) values ($1,'topup',572,'mbank','Пополнение · MBank (тест)', now() - interval '2 days')", [azamat.id]);
    await pool.query("insert into wallet_tx (driver_id, kind, amount, order_id, note, created_at) values ($1,'commission',-72,$2,'Комиссия 8% · заказ', now() - interval '26 hours')", [azamat.id, done]);
    void bakyt;
    console.log("demo data seeded");
  } finally {
    await pool.end();
  }
}
