-- Run with `npm run db:seed`. seed.js provides a bcrypt hash through a
-- transaction-local setting. No passwords or generated hashes are committed.
-- Stable seed keys make every insert repeatable without overwriting user edits.
DO $$
BEGIN
  IF current_setting('circle.demo_password_hash', true) IS NULL THEN
    RAISE EXCEPTION 'Run seed.js to provide DEMO_PASSWORD safely.';
  END IF;
END $$;

INSERT INTO users (full_name, username, email, password_hash, bio, created_at, seed_key)
SELECT full_name, username, email, current_setting('circle.demo_password_hash'), bio,
       now() - joined_days * interval '1 day', seed_key
FROM (VALUES
  ('Maya Chen', 'maya', 'maya@circle.example', 'Product designer. Collector of small moments. Making room for more meaningful things.', 120, 'circle.demo.maya'),
  ('Lin Park', 'lin', 'lin@circle.example', 'Finding inspiration where the trail ends. Photographer, walker, and morning person.', 96, 'circle.demo.lin'),
  ('Elliot Reed', 'elliot', 'elliot@circle.example', 'Building thoughtful things for the web. Usually with a coffee nearby.', 85, 'circle.demo.elliot'),
  ('Ava Morgan', 'ava', 'ava@circle.example', 'Ceramics, slow living, and a very full sketchbook. Based somewhere sunny.', 72, 'circle.demo.ava'),
  ('Noah Patel', 'noah', 'noah@circle.example', 'Words, playlists, and good conversations. Curious about almost everything.', 60, 'circle.demo.noah'),
  ('Sofia Rivera', 'sofia', 'sofia@circle.example', 'Illustrator exploring the everyday. A little color goes a long way.', 45, 'circle.demo.sofia'),
  ('Oliver Brooks', 'oliver', 'oliver@circle.example', 'Community gardener. Learning to grow things, one season at a time.', 34, 'circle.demo.oliver')
) AS demo(full_name, username, email, bio, joined_days, seed_key)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO posts (user_id, content, image_url, created_at, updated_at, seed_key)
SELECT u.id, demo.content, demo.image_url,
       now() - demo.age_minutes * interval '1 minute',
       now() - demo.age_minutes * interval '1 minute', demo.seed_key
FROM (VALUES
  ('lin', 'A little reminder to take the scenic route. Spent the morning without a plan, just following the light. Sometimes that is exactly what you need. 🌿 #Outside #SmallMoments', 'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1400&q=85', 18, 'circle.post.scenic'),
  ('maya', 'The best part of making something? Finding your people along the way. Working on a few little ideas this week and leaving plenty of space for the unexpected. What are you creating lately? ✨ #Design #CreativeLife', NULL, 48, 'circle.post.making'),
  ('ava', 'Fresh from the kiln. A gentle reminder that a slightly imperfect shape can still hold something beautiful. These Sunday studio mornings are becoming my favorite ritual. #SlowLiving #CreativeLife', NULL, 92, 'circle.post.kiln'),
  ('elliot', 'A small win today: closed the laptop on time and took a proper walk. The tricky problem I had been staring at all afternoon solved itself somewhere between the park and home. #SmallMoments', NULL, 145, 'circle.post.walk'),
  ('sofia', 'This week’s palette is borrowed from the garden: sage, clay, cream, and a very determined little yellow flower. Inspiration really does hide in plain sight. #Design #Outside', NULL, 220, 'circle.post.palette'),
  ('noah', 'What is one book that made you see the world a little differently? Building a reading list for slower evenings. All genres welcome. 📚 #GoodConversations', NULL, 310, 'circle.post.books'),
  ('oliver', 'The first tomatoes are finally here. After weeks of patiently checking, watering, and checking again, this feels like a small celebration. Sharing a basket with the neighbors tonight. #Outside #SmallMoments', NULL, 470, 'circle.post.tomatoes'),
  ('maya', 'A design note to myself: useful can be beautiful, and beautiful can be quiet. The best details are often the ones that make somebody’s day a little easier. #Design', NULL, 720, 'circle.post.quiet'),
  ('lin', 'Collected a few quiet moments from the coast this weekend. Salt air, long shadows, and absolutely nowhere to be. #Outside #SlowLiving', 'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?auto=format&fit=crop&w=1400&q=85', 1020, 'circle.post.coast'),
  ('elliot', 'Made a tiny tool for a friend today. No grand launch, no roadmap. Just one less annoying task in their day. A good reminder of why I love building things. #Design #CreativeLife', NULL, 1390, 'circle.post.tinytool'),
  ('ava', 'Today’s invitation: make something with your hands, however small. Fold a letter. Plant a seed. Draw the view from your window. There is no need to be good at it. #CreativeLife #SlowLiving', NULL, 1810, 'circle.post.hands'),
  ('sofia', 'Sharing the rough sketch before the finished piece today. The messy middle deserves a little love, too. #CreativeLife', NULL, 2300, 'circle.post.sketch'),
  ('noah', 'Sunday soundtrack: the kettle, rain against the window, and a record you know by heart. Hope your weekend has a little room to breathe. #SlowLiving #SmallMoments', NULL, 2860, 'circle.post.sunday'),
  ('oliver', 'Our neighborhood seed swap is turning into a lovely little tradition. I came home with basil, wildflowers, and three new friends. Community grows in the smallest ways. #Outside #GoodConversations', NULL, 3420, 'circle.post.seeds'),
  ('maya', 'Hello, CIRCLE. Happy to have a little corner of the internet for thoughtful conversations and things that make us feel more connected. Let’s make it a good one. #GoodConversations', NULL, 4200, 'circle.post.hello')
) AS demo(username, content, image_url, age_minutes, seed_key)
JOIN users u ON u.seed_key = 'circle.demo.' || demo.username
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO comments (post_id, user_id, content, created_at, updated_at, seed_key)
SELECT p.id, u.id, demo.content,
       p.created_at + interval '5 minutes', p.created_at + interval '5 minutes', demo.seed_key
FROM (VALUES
  ('circle.post.scenic', 'maya', 'This is the kind of reset I needed to see today. Beautiful light!', 'circle.comment.scenic.maya'),
  ('circle.post.scenic', 'oliver', 'The scenic route always has the best surprises.', 'circle.comment.scenic.oliver'),
  ('circle.post.making', 'ava', 'A few new cups and a lot of experiments. Leaving room for the unexpected is the best part.', 'circle.comment.making.ava'),
  ('circle.post.making', 'elliot', 'A tiny reading app for myself. Sometimes the personal projects teach you the most.', 'circle.comment.making.elliot'),
  ('circle.post.kiln', 'sofia', 'I love this. The imperfections are what make it yours.', 'circle.comment.kiln.sofia'),
  ('circle.post.books', 'maya', 'Braiding Sweetgrass. I keep coming back to it whenever I need to slow down.', 'circle.comment.books.maya'),
  ('circle.post.books', 'lin', 'A Field Guide to Getting Lost was a lovely companion on my last trip.', 'circle.comment.books.lin'),
  ('circle.post.quiet', 'noah', 'Beautiful can be quiet. Keeping that thought for the week.', 'circle.comment.quiet.noah'),
  ('circle.post.seeds', 'ava', 'This sounds wonderful. We should try something like this on our street!', 'circle.comment.seeds.ava'),
  ('circle.post.hello', 'sofia', 'Already feels like a lovely place to land. Glad you are here.', 'circle.comment.hello.sofia')
) AS demo(post_key, username, content, seed_key)
JOIN posts p ON p.seed_key = demo.post_key
JOIN users u ON u.seed_key = 'circle.demo.' || demo.username
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO likes (post_id, user_id)
SELECT p.id, u.id
FROM (VALUES
  ('circle.post.scenic', 'maya'), ('circle.post.scenic', 'ava'), ('circle.post.scenic', 'noah'),
  ('circle.post.scenic', 'oliver'), ('circle.post.scenic', 'sofia'),
  ('circle.post.making', 'lin'), ('circle.post.making', 'noah'), ('circle.post.making', 'ava'),
  ('circle.post.making', 'elliot'), ('circle.post.kiln', 'maya'), ('circle.post.kiln', 'sofia'),
  ('circle.post.kiln', 'oliver'), ('circle.post.walk', 'maya'), ('circle.post.walk', 'lin'),
  ('circle.post.palette', 'ava'), ('circle.post.palette', 'maya'), ('circle.post.books', 'lin'),
  ('circle.post.books', 'sofia'), ('circle.post.tomatoes', 'ava'), ('circle.post.quiet', 'noah'),
  ('circle.post.quiet', 'elliot'), ('circle.post.coast', 'maya'), ('circle.post.coast', 'ava'),
  ('circle.post.tinytool', 'maya'), ('circle.post.hands', 'sofia'), ('circle.post.sketch', 'ava'),
  ('circle.post.sunday', 'lin'), ('circle.post.seeds', 'maya'), ('circle.post.hello', 'sofia')
) AS demo(post_key, username)
JOIN posts p ON p.seed_key = demo.post_key
JOIN users u ON u.seed_key = 'circle.demo.' || demo.username
ON CONFLICT (post_id, user_id) DO NOTHING;

INSERT INTO follows (follower_id, following_id)
SELECT follower.id, followed.id
FROM (VALUES
  ('maya', 'lin'), ('maya', 'elliot'), ('maya', 'ava'),
  ('lin', 'maya'), ('lin', 'oliver'), ('lin', 'noah'),
  ('elliot', 'maya'), ('elliot', 'sofia'), ('ava', 'maya'), ('ava', 'sofia'),
  ('noah', 'maya'), ('noah', 'lin'), ('sofia', 'maya'), ('sofia', 'ava'),
  ('oliver', 'lin'), ('oliver', 'ava')
) AS demo(follower, followed)
JOIN users follower ON follower.seed_key = 'circle.demo.' || demo.follower
JOIN users followed ON followed.seed_key = 'circle.demo.' || demo.followed
ON CONFLICT (follower_id, following_id) DO NOTHING;

INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id, is_read, created_at, seed_key)
SELECT recipient.id, actor.id, demo.type, p.id, c.id, demo.is_read,
       now() - demo.age_minutes * interval '1 minute', demo.seed_key
FROM (VALUES
  ('maya', 'lin', 'follow', NULL, NULL, false, 12, 'circle.notification.lin-follow-maya'),
  ('maya', 'noah', 'like', 'circle.post.making', NULL, false, 24, 'circle.notification.noah-like-maya'),
  ('maya', 'ava', 'comment', 'circle.post.making', 'circle.comment.making.ava', false, 30, 'circle.notification.ava-comment-maya'),
  ('maya', 'elliot', 'follow', NULL, NULL, true, 180, 'circle.notification.elliot-follow-maya'),
  ('maya', 'noah', 'comment', 'circle.post.quiet', 'circle.comment.quiet.noah', true, 600, 'circle.notification.noah-comment-maya'),
  ('lin', 'maya', 'like', 'circle.post.scenic', NULL, false, 8, 'circle.notification.maya-like-lin'),
  ('lin', 'maya', 'comment', 'circle.post.scenic', 'circle.comment.scenic.maya', false, 7, 'circle.notification.maya-comment-lin'),
  ('ava', 'sofia', 'comment', 'circle.post.kiln', 'circle.comment.kiln.sofia', false, 80, 'circle.notification.sofia-comment-ava')
) AS demo(recipient, actor, type, post_key, comment_key, is_read, age_minutes, seed_key)
JOIN users recipient ON recipient.seed_key = 'circle.demo.' || demo.recipient
JOIN users actor ON actor.seed_key = 'circle.demo.' || demo.actor
LEFT JOIN posts p ON p.seed_key = demo.post_key
LEFT JOIN comments c ON c.seed_key = demo.comment_key
ON CONFLICT (seed_key) DO NOTHING;
