const truths = [
  {
    statements: ['Las ballenas son mamíferos.', 'La Tierra gira alrededor de la Luna.', 'Un año bisiesto tiene 366 días.'],
    lie: 1, explanation: 'La Luna gira alrededor de la Tierra.',
  },
  {
    statements: ['La capital de Australia es Sídney.', 'La Antártida está en el hemisferio sur.', 'Un hexágono tiene seis lados.'],
    lie: 0, explanation: 'La capital de Australia es Canberra.',
  },
  {
    statements: ['En ajedrez, el alfil se mueve en diagonal.', 'El caballo puede saltar otras piezas.', 'La torre se mueve en diagonal.'],
    lie: 2, explanation: 'La torre se mueve en línea recta por filas y columnas.',
  },
  {
    statements: ['El Sol es una estrella.', 'Marte es el planeta más cercano al Sol.', 'Júpiter es más grande que la Tierra.'],
    lie: 1, explanation: 'Mercurio es el planeta más cercano al Sol.',
  },
  {
    statements: ['Un kilómetro tiene cien metros.', 'Una hora tiene sesenta minutos.', 'Un triángulo tiene tres lados.'],
    lie: 0, explanation: 'Un kilómetro tiene mil metros.',
  },
];

const dilemmas = [
  {
    options: ['Que suene música de jefe final cada vez que entras a una panadería.', 'Que tu nevera anuncie con voz de estadio lo que vas a comer.'],
    reactions: ['Esa sí es una entrada. Que la primera batalla sea por el último pan de bono.', 'Je, je. ¡Y ahora, directo desde la nevera, el yogur de medianoche!'],
  },
  {
    options: ['Que tus zapatos aplaudan cuando corres.', 'Que tu silla diga «ay» cada vez que te sientas.'],
    reactions: ['Me gusta. Si llegas tarde, por lo menos llegas con público.', 'Je, je. A esa silla se le viene una carrera en el teatro.'],
  },
  {
    options: ['Tener un dragón del tamaño de un gato.', 'Tener un gato del tamaño de un dragón.'],
    reactions: ['Perfecto para tostar el pan. Solo es cuestión de enseñarle qué es una tostada y qué es el sofá.', 'Uy. La primera misión es encontrar una caja de cartón de su tamaño.'],
  },
  {
    options: ['Poder hablar con los ascensores.', 'Poder discutir con los semáforos.'],
    reactions: ['Yo arrancaría preguntando quién se baja siempre en el piso equivocado.', 'A ver qué cara pone el rojo cuando le digas que tú también tienes afán.'],
  },
];

const mysteries = [
  {
    setup: 'Alguien sacó la llave de un armario. Mara, Leo y Nora fueron las únicas personas que entraron. Una salió a las seis, otra a las siete y otra a las ocho. Mara salió antes que Leo. Nora salió después de Leo. La persona que tomó la llave salió a las siete.',
    question: '¿Quién tomó la llave?',
    options: ['Mara', 'Leo', 'Nora'], answer: 1,
    hints: ['Ordena a las tres personas de la primera a la última.', 'Leo salió después de Mara y antes de Nora.'],
    explanation: 'Mara salió a las seis, Leo a las siete y Nora a las ocho. Leo es quien salió a la hora en que se llevaron la llave.',
  },
  {
    setup: 'Una nota secreta está en un solo cajón. Hay tres, uno azul, uno verde y uno rojo. La etiqueta del cajón azul dice «La nota está en este cajón». La del verde dice «La nota no está en el cajón azul». La del rojo dice «La nota no está en el cajón verde». Solo una etiqueta dice la verdad.',
    question: '¿En qué cajón está la nota?',
    options: ['azul', 'verde', 'rojo'], answer: 1,
    hints: ['Las etiquetas azul y verde dicen lo contrario. Exactamente una de las dos dice la verdad.', 'Si una de las dos primeras dice la verdad, la etiqueta roja tiene que mentir.'],
    explanation: 'Las etiquetas azul y verde se contradicen. Como solo puede haber una verdadera, la roja miente. La nota sí está en el cajón verde.',
  },
  {
    setup: 'Un relojero perdió un engranaje en uno de sus tres bancos de trabajo, el de la ventana, el de la puerta o el del centro. Sabe que lo dejó al lado de una lámpara encendida. En el banco de la ventana no hay lámpara y la del centro estaba desenchufada.',
    question: '¿En qué banco está el engranaje?',
    options: ['ventana', 'puerta', 'centro'], answer: 1,
    hints: ['Busca el banco que sí tiene una lámpara y podía tenerla encendida.', 'Puedes descartar la ventana y el centro con dos detalles distintos.'],
    explanation: 'Solo la lámpara de la puerta podía estar encendida. Ahí dejó el engranaje.',
  },
];

const premises = [
  'A medianoche, un gato con corbata dejó una llave en nuestra puerta y preguntó si habíamos visto el ascensor del tiempo.',
  'En la última tienda del pueblo vendían frascos de lluvia. Uno tenía una etiqueta escrita a mano que decía «Abrir solo si el sol empieza a roncar».',
  'La impresora del pueblo sacó una página que nadie había enviado. En ella había un mapa que terminaba debajo de la mesa de la cocina.',
  'Al abrir una caja de empanadas, encontramos un mensaje diminuto y una brújula que apuntaba siempre a la empanada equivocada.',
];

module.exports = { truths, dilemmas, mysteries, premises };
