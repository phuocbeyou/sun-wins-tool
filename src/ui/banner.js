import chalk from 'chalk';
import boxen from 'boxen';

export function banner() {
  const title = chalk.bold.green('🚀 Pheron Team CLI');
  const welcome = chalk.whiteBright('🎉 Chào mừng bạn quay lại!');
  const author = chalk.cyan('👨Phát triển bởi ') + chalk.bold.magenta('Pheron Team');
  const contact = chalk.yellow('📞 Liên hệ: ') + chalk.bold.white('0356 363 154');

  const content = [
    title,
    '',
    welcome,
    author,
    contact,
  ].join('\n');

  const boxed = boxen(content, {
    padding: {
      top: 1,
      bottom: 1,
      left: 4,
      right: 4,
    },
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan',
    backgroundColor: '#1a1a1a',
    title: chalk.bold.cyanBright(' PHERON TEAM '),
    titleAlignment: 'center',
    float: 'center',
  });

  console.log(boxed);
}
